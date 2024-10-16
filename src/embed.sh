input_file="$(dirname "$0")/index.html"
output_file="${1}.html"

sed -e '/^__MENO_INITIAL_LOADING_DATA_PLACE_HOLDER__/{r '"$1"'' -e 'd}' "$input_file" > "$output_file"

