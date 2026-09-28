if {[catch {
    set_db max_cpus_per_server 2
    set_db auto_ungroup none
    read_libs [split $::env(MENO_LIBERTY_FILES) :]
    read_hdl -sv hierarchy.sv
    elaborate sample_top
    read_sdc constraints.sdc
    set_db syn_generic_effort low
    set_db syn_map_effort low
    set_db syn_opt_effort low
    syn_generic
    syn_map
    syn_opt
    report_area > area.rpt
    report_area -show_full_names > area_full.rpt
    report_power -by_hierarchy -levels 10 -unit uW > power.rpt
    report_timing -max_paths 1 > timing.rpt
    check_design -unresolved > design_check.rpt
    write_hdl > netlist.v
    set marker [open complete.txt w]
    puts $marker "Synthesis completed."
    close $marker
} message]} {
    puts stderr "Synthesis failed: $message"
    exit 1
}
exit
