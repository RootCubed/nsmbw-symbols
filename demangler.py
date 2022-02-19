# Mostly written by Ninji

# 'Fixes' for the NVIDIA demangler added by RoadrunnerWMC and RootCubed

from typing import Tuple
import re

dem_nvidia = False
dem_corr = False
rem_itanium = False

def parse_numbered(s: str, i: int) -> Tuple[str, int]:
    assert(s[i].isdigit())
    size = 0
    while s[i].isdigit():
        size = size * 10 + int(s[i])
        i += 1
    name = s[i:(i + size)]
    return name, (i + size)


def parse_typename(s: str, i: int, shouldAddNest: bool) -> Tuple[str, int]:
    if s[i] == 'Q':
        count = int(s[i + 1])
        i += 2
        bits = []
        for _ in range(count):
            bit, i = parse_numbered(s, i)
            bit = resolve_templates(bit)
            bits.append(bit)
        if not rem_itanium:
            return '::'.join(bits), i
        else:
            if shouldAddNest:
                return f'N{"".join(bits)}E', i
            else:
                return "".join(bits), i
    elif s[i] == 'F':
        return '', i
    else:
        s, i = parse_numbered(s, i)
        return (resolve_templates(s), i)

names_demangle = {
    'v': 'void',
    'b': 'bool',
    'c': 'char',
    's': 'short',
    'i': 'int',
    'l': 'long',
    'Sc': 'signed char',
    'Uc': 'unsigned char',
    'Us': 'unsigned short',
    'Ui': 'unsigned int',
    'Ul': 'unsigned long',
    'f': 'float',
    'w': 'wchar_t',
    'e': '...'
}

names_demangle_nvidia = {
    'v': 'void',
    'b': 'bool',
    'c': 'char',
    's': 'short',
    'i': 'int',
    'l': 'long',
    'Uc': 'unsigned char',
    'Us': 'unsigned short',
    'Ui': 'unsigned int',
    'Ul': 'unsigned long',
    'f': 'float',
    'w': 'wchar_t'
}

names_remangle_itanium = {
    'v': 'v',
    'b': 'b',
    'c': 'c',
    's': 's',
    'i': 'i',
    'l': 'l',
    'f': 'f',
    'w': 'w',
    'Sc': 'a',
    'Uc': 'h',
    'Us': 't',
    'Ui': 'j',
    'Ul': 'm',
    'e': 'z'
}

# Note: func_depth is unused when not in the demangle_nvidia mode.
def parse_type(s: str, i: int, func_depth: int) -> Tuple[str, int, int]:
    #print(s[i:])
    is_pointer = False
    is_ref = False

    type_name = ''
    type_modifier = ''

    while i < len(s) and s[i].isupper():
        c = s[i]
        if c == 'C':
            if dem_nvidia or dem_corr:
                type_name += 'const '
            else:
                type_name += 'K'
        elif c == 'P':
            is_pointer = True # NVIDIA demangler bug: multi-pointers get displayed as single pointer
            if not dem_nvidia:
                add_typename, i, func_depth = parse_type(s, i + 1, 0)
                if dem_corr:
                    # hacky solution but it works
                    if add_typename.find('$POINTERS$') > -1:
                        return type_name + add_typename.replace('$POINTERS$', '*$POINTERS$'), i, 0
                    else:
                        return type_name + add_typename + '*', i, 0
                else:
                    type_name += 'P'
                    return type_name + add_typename, i, 0
        elif c == 'R':
            is_ref = True
            if rem_itanium:
                type_name += 'R'
        elif c == 'U':
            type_modifier = 'U'
        elif c == 'S':
            type_modifier = 'S'
        elif c == 'F':
            if dem_nvidia:
                # NVIDIA demangler bug: function pointers are incorrectly handled
                func_depth += 1
                type_name += '( '
                return type_name, i + 1, func_depth
            elif dem_corr or rem_itanium:
                arg_str = ''
                i += 1
                is_done = False
                while True:
                    if s[i] == '_':
                        is_done = True
                        i += 1
                    recurse_typename, i, _ = parse_type(s, i, 0)
                    if is_done: break
                    arg_str += recurse_typename
                    if not rem_itanium:
                        arg_str += ', '
                if dem_corr:
                    arg_str = arg_str[:-2] # remove last comma
                    type_name += f'{recurse_typename} ($POINTERS$)( {arg_str} )'
                elif rem_itanium:
                    type_name += f'F{recurse_typename}{arg_str}E'
                return type_name, i, func_depth
        elif c == 'A':
            if dem_nvidia:
                raise Exception(s)
            count = int(s[i + 1])
            array_type, i, _ = parse_type(s, i + 3, func_depth)
            if dem_corr:
                if array_type.find("[") > -1:
                    split = array_type.split("[", 1)
                    array_type = split[0]
                    other_array_sizes = '[' + split[1]
                    return f'{array_type}[{count}]{other_array_sizes}', i, 0
                return f'{array_type}[{count}]', i, 0
            if rem_itanium:
                return f'A{count}_{array_type}', i, 0
        elif c == 'M':
            if dem_nvidia:
                raise Exception(s)
            if dem_corr or rem_itanium:
                class_name, i, _ = parse_type(s, i + 1, func_depth)
                assert s[i] == 'F'
                arg_str = ''
                i += 1
                is_done = False
                while True:
                    if s[i] == '_':
                        is_done = True
                        i += 1
                    recurse_typename, i, _ = parse_type(s, i, 0)
                    if is_done: break
                    arg_str += recurse_typename
                    if not rem_itanium:
                        arg_str += ', '
                if dem_corr:
                    arg_str = arg_str[:-2] # remove last comma
                    type_name += f'{recurse_typename} ({class_name}::*$POINTERS$)( {arg_str} )'
                elif rem_itanium:
                    type_name += f'M{class_name}F{recurse_typename}{arg_str}E'
                return type_name, i, func_depth

        elif c == 'Q': # handled by next section
            break
        else:
            raise Exception(s)
        i += 1

    if i >= len(s):
        raise Exception(s)

    if not s[i].isalpha() and not s[i].isdigit():
        raise Exception(s)

    c = s[i]
    if c == 'Q' or c.isdigit():
        n, i = parse_typename(s, i, True)
        type_name += n
    else:
        c = type_modifier + c
        if dem_corr: names_to_use = names_demangle
        if dem_nvidia: names_to_use = names_demangle_nvidia
        if rem_itanium: names_to_use = names_remangle_itanium
        if c not in names_to_use:
            raise Exception(s)
        type_name += names_to_use[c]
        i += 1

    if dem_nvidia:
        if is_pointer:
            type_name += '*'
    if not rem_itanium and is_ref:
        type_name += '&'

    if dem_nvidia:
        return type_name + ', ', i, func_depth
    else:
        return type_name, i, 0

def resolve_templates(s: str) -> str:
    tem_pos = s.find('<')
    if tem_pos == -1:
        if not rem_itanium:
            return s
        else:
            return str(len(s)) + s
    i = tem_pos
    depth = 0
    while i < len(s):
        if s[i] == '<': depth += 1
        if s[i] == '>': depth -= 1
        if depth == 0: break
        i += 1
    template_str = s[tem_pos + 1:i]
    template_args = template_str.split(',')
    remangle_real_length = len(s.split('<')[0])
    if dem_nvidia:
        # NVIDIA demangler bug: only parse type for first template argument
        template_args[0], _, _ = parse_type(template_args[0], 0, 0)
        template_args[0] = template_args[0][:-2] # remove comma
    else:
        for i in range(len(template_args)):
            if template_args[i].isdigit():
                # integer literal in template? uhhhh ok
                if dem_corr:
                    template_args[i] = template_args[i]
                else:
                    template_args[i] = "XLi" + template_args[i] + "EE"
                continue
            template_args[i], _, _ = parse_type(template_args[i], 0, 0)
            template_args[i] = template_args[i].replace('$POINTERS$', '')
    if not rem_itanium:
        return re.sub('<(.+)>[^>]*$', f'<{",".join(template_args)}>', s)
    else:
        return str(remangle_real_length) + re.sub('<(.+)>[^>]*$', f'I{"".join(template_args)}E', s)

def demangle(s: str) -> str:
    if s.endswith('__'): return s

    split_symbol = re.search('^(..+?)__([CFQ1234567890].+)', s)
    if split_symbol == None: return s

    method = split_symbol.group(1)
    clas, i = parse_typename(s, len(method) + 2, False)

    local_sym = False
    guard_sym = False
    if not dem_nvidia and (method.startswith('@LOCAL@') or method.startswith('@GUARD@')):
        if method.startswith('@LOCAL'):
            local_sym = True
        else:
            guard_sym = True

        method = re.sub('@(LOCAL|GUARD)@', '', method)

    # NVIDIA demangler bug: templated function names don't get demangled
    # method = resolve_templates(method)
    if not dem_nvidia:
        new_method = resolve_templates(method)
        function_templating = (new_method != method)
        method = new_method

    is_vtable = False
    if rem_itanium:
        if method == '4__dt':
            method = 'D0'
        elif method == '4__ct':
            method = 'C1'
        elif method == '4__vt':
            method = ''
            is_vtable = True



    demangled = ''
    remangle_is_nested = False

    if not rem_itanium:
        demangled = clas
    if clas != '':
        remangle_is_nested = True
        if not rem_itanium:
            demangled += '::'


    if not rem_itanium:
        demangled += method

    is_const = False
    if not i >= len(s) and s[i] == 'C':
        is_const = True
        i += 1

    if not dem_nvidia:
        i += 1 # skip over initial F
        if dem_corr:
            demangled += '( '

    param_string = ''
    func_depth = 0
    func_ret_type = ''
    special_sym_end_str = ''
    local_sym_name = ''
    while i < len(s):
        arg = ''
        if not dem_nvidia and s[i] == '@' and (local_sym or guard_sym):
            subs = s[i + 1:].split('@')
            local_sym_name = subs[0]
            if len(subs) == 1:
                special_sym_end_str = str(len(subs[0])) + subs[0] + '_0'
            elif len(subs) == 2:
                special_sym_end_str = str(len(subs[0])) + subs[0] + '_' + subs[1]
            break
        try:
            is_ret_val = False
            if not dem_nvidia and s[i] == '_':
                is_ret_val = True
                i += 1
            arg, i, func_depth = parse_type(s, i, func_depth)
            if dem_corr:
                arg = arg.replace('$POINTERS$', '')
            if not dem_nvidia and function_templating and is_ret_val:
                func_ret_type = arg
                continue
        except Exception:
            if dem_nvidia:
                param_string += arg + ', ' # NVIDIA demangler bug: if reaching an invalid argument, it adds the comma and ends the demangling
            else:
                raise Exception('An error occured.')
            break
        param_string += arg
        if dem_corr:
            param_string += ', '
    if not rem_itanium:
        param_string = param_string[:-2] # remove last comma

    if not rem_itanium:
        demangled += param_string

    num_closing_brackets = 0
    if dem_nvidia:
        num_closing_brackets = func_depth
    if dem_corr:
        num_closing_brackets = 1

    if not rem_itanium:
        for i in range(num_closing_brackets):
            demangled += ' )'

        if is_const:
            demangled += ' const'

    if dem_corr:
        if func_ret_type != '':
            demangled = f'{func_ret_type} {demangled}'
        if local_sym:
            return demangled + '::' + local_sym_name
        if guard_sym:
            return f'guard variable for {demangled}'
    if not rem_itanium:
        return demangled
    else:
        lsbeg = 'Z' if local_sym else ''
        lsend = 'E' if local_sym else ''
        gs = 'GV' if guard_sym else ''
        nesbeg = 'N' if remangle_is_nested else ''
        nesend = 'E' if remangle_is_nested else ''
        cs = 'K' if is_const else ''
        vt = 'TV' if is_vtable else ''
        return f'_Z{lsbeg}{gs}{vt}{nesbeg}{cs}{clas}{method}{nesend}{func_ret_type}{param_string}{lsend}{special_sym_end_str}'

import os
import sys

def main():
    global dem_corr, dem_nvidia, rem_itanium
    if len(sys.argv) < 2:
        dem_corr = True
        while True:
            sym = input()
            print(demangle(sym))
        return
    demang_type = sys.argv[1]
    if demang_type == 'demangle':
        dem_corr = True
    elif demang_type =='demangle_nvidia':
        dem_nvidia = True
    elif demang_type == 'remangle_itanium':
        rem_itanium = True
    else:
        print('Please specify demangling type (demangle, demangle_nvidia or remangle_itanium)')
        return
    if len(sys.argv) == 2:
        while True:
            sym = input()
            print(demangle(sym))

    arg = sys.argv[2]
    if not os.path.isfile(arg):
        print(demangle(arg))
        return

    with open(arg, 'r') as inputFile:
        lines = tuple(line.strip() for line in inputFile)

    for line in lines:
        line_parts = line.split(" ")
        line_parts[0] = demangle(line_parts[0])
        #print(line)
        print(' '.join(line_parts))

if __name__ == '__main__':
    main()