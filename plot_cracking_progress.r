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

ggplot(trimmed_table, aes(x = time, y = count)) +
  geom_line(color = "#0c3e59", size = 1) +
  scale_x_datetime(name = "", date_labels = "%Y-%m-%d", date_breaks = "7 days") +
  scale_y_continuous(name = "# Symbols remaining") +
  theme_fivethirtyeight() +
  theme(axis.title = element_text()) +
  theme(axis.text.x = element_text(angle = 50, hjust = 1))

ggsave("static/progress_plot.png", width = 7.5, height = 5, dpi = 200)