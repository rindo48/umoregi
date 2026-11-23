"""src/ の中身を一枚の HTML（埋もれ木.html）にまとめる。

    python build.py

src/index.html が読み込んでいる CSS と JavaScript をその場に埋め込むだけの、小さな仕組み。
Google Fonts だけは外から読み込む（つながらないときは手元の書体で表示される）。
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "埋もれ木.html"


def inline_css(m):
    href = m.group(1)
    css = (SRC / href).read_text(encoding="utf-8")
    return "<style>\n" + css + "\n</style>"


def inline_js(m):
    src = m.group(1)
    js = (SRC / src).read_text(encoding="utf-8")
    js = js.replace("</script", "<\\/script")
    return "<script>\n/* " + src + " */\n" + js + "\n</script>"


def main():
    html = (SRC / "index.html").read_text(encoding="utf-8")
    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', inline_css, html)
    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)
    OUT.write_text(html, encoding="utf-8", newline="\n")
    # GitHub Pages はトップの index.html を開くので、同じ中身をもう一枚書き出す
    (ROOT / "index.html").write_text(html, encoding="utf-8", newline="\n")
    print(f"{OUT.name} / index.html: {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
