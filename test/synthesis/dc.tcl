if {[catch {
    set_host_options -max_cores 2
    set target_library [split $::env(MENO_DB_FILES) :]
    set link_library [concat [list *] $target_library]
    if {![analyze -format sverilog hierarchy.sv]} { error "RTL analysis failed" }
    elaborate sample_top
    current_design sample_top
    if {![link]} { error "Design linking failed" }
    source constraints.sdc
    set_ungroup [get_designs *] false
    compile -map_effort low
    redirect area.rpt { report_area -hierarchy -nosplit }
    redirect power.rpt { report_power -hierarchy -nosplit }
    redirect timing.rpt { report_timing -max_paths 1 -nosplit }
    redirect design_check.rpt { check_design }
    write -format verilog -hierarchy -output netlist.v
    set marker [open complete.txt w]
    puts $marker "Synthesis completed."
    close $marker
} message]} {
    puts stderr "Synthesis failed: $message"
    exit 1
}
exit
