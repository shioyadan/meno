# 値は読み込んだライブラリの時間単位。性能比較ではなくreport生成が目的。
set fixture_period $::env(MENO_CLOCK_PERIOD)
create_clock -name fixture_clock -period $fixture_period [get_ports clk]
set_input_delay [expr {$fixture_period * 0.05}] -clock fixture_clock [get_ports {a* b* reset enable}]
set_output_delay [expr {$fixture_period * 0.05}] -clock fixture_clock [all_outputs]
set_input_transition [expr {$fixture_period * 0.025}] [all_inputs]
