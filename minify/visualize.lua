-- visualize.lua
local lfs = require("lfs")
local merge_html = require("merge_html")
local merge_js = require("merge_js")
local merge_css = require("merge_css")

local function main(arg)
    local absolute_path = lfs.get_script_path(1).."../"
    
    local html_file = lfs.open_file(absolute_path.."index.html", "r")
    local html_content = html_file:read("*all")
    html_file:close()

    local css_content
    css_content, html_content = merge_css.process(html_content, absolute_path)

    local js_content
    js_content, html_content = merge_js.process(html_content, absolute_path)

    html_content = merge_html.minify(html_content)

    html_content = merge_html.embed_assets_into_html(html_content, css_content, js_content, absolute_path)

    local output_file = io.open("index.min.html", "w")
    output_file:write(html_content)
    output_file:close()

end

-- Run the main function
main(arg)
