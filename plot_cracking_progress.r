#!/usr/bin/Rscript

library(ggplot2)
library(ggthemes)
library(hrbrthemes)
library(dplyr)

sym_data <- read.csv("symbols_plot.csv")

symbols_table <- data.frame(
  count = sym_data$count,
  time = as.POSIXct(sym_data$time, origin = "1970-01-01", tz = "CET")
)

trimmed_table <- symbols_table[
  symbols_table$time > as.POSIXct(1645300000, origin = "1970-01-01", tz = "CET"),
]

options(repr.plot.width=15, repr.plot.height=8)

max_val <- max(trimmed_table$count) + 500

ggplot(trimmed_table, aes(x = time, y = count)) +
  ggtitle("# Symbols remaining") +
  geom_line(color = "#0c3e59", size = 1) +
  scale_x_datetime(name = "", date_labels = "%Y-%m-%d", date_breaks = "7 days") +
  scale_y_continuous(
    breaks = seq(0, max_val, by = 500),
    limits = c(0, max_val),
    expand = c(0, 0),
    name = ""
  ) +
  geom_hline(yintercept = 0, color = "black") +
  theme_fivethirtyeight() +
  theme(axis.title = element_text()) +
  theme(axis.text.x = element_text(angle = 50, hjust = 1))

ggsave("static/progress_plot.png", width = 7.5, height = 5, dpi = 200)