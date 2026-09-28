// 公開テスト専用の回路。同じmoduleの複数instanceとgenerate名を残す。
module sample_arithmetic (
    input wire [7:0] a, b,
    output wire [7:0] result
);
    assign result = (a > b) ? (a + b) : (a ^ b);
endmodule

module sample_lane (
    input wire clk, reset, enable,
    input wire [7:0] a, b,
    output reg [7:0] result
);
    wire [7:0] next_result;
    sample_arithmetic u_arithmetic_with_a_deliberately_long_instance_name (
        .a(a), .b(b), .result(next_result)
    );
    always @(posedge clk) begin
        if (reset) result <= 8'b0;
        else if (enable) result <= next_result;
    end
endmodule

module sample_top (
    input wire clk, reset, enable,
    input wire [15:0] a, b,
    output wire [15:0] result
);
    genvar i;
    generate
        for (i = 0; i < 2; i = i + 1) begin : lanes
            sample_lane u_lane (
                .clk(clk), .reset(reset), .enable(enable),
                .a(a[i*8 +: 8]), .b(b[i*8 +: 8]),
                .result(result[i*8 +: 8])
            );
        end
    endgenerate
endmodule
