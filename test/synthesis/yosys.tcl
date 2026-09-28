set libraries {}
if {[info exists ::env(MENO_LIBERTY_FILES)] && $::env(MENO_LIBERTY_FILES) ne ""} {
    set libraries [split $::env(MENO_LIBERTY_FILES) :]
}
set library_args {}
foreach library $libraries {
    yosys read_liberty -lib $library
    lappend library_args -liberty $library
}
yosys read_verilog -sv hierarchy.sv
yosys synth -top sample_top -noabc
if {[llength $libraries]} {
    yosys dfflibmap {*}$library_args
    yosys abc {*}$library_args
} else {
    yosys abc
}
yosys clean
yosys check -assert
yosys tee -o stats.txt stat -top sample_top {*}$library_args
yosys tee -o stats.json stat -json -top sample_top {*}$library_args
yosys write_json design.json
yosys write_verilog -noattr netlist.v
set marker [open complete.txt w]
puts $marker "Synthesis completed."
close $marker
