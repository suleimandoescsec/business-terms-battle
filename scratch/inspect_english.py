from pypdf import PdfReader
import sys

def inspect_pdf(path, output_path, pages_to_read=10):
    try:
        reader = PdfReader(path)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"--- {path} ---\n")
            for i in range(min(len(reader.pages), pages_to_read)):
                f.write(f"\n--- Page {i+1} ---\n")
                text = reader.pages[i].extract_text()
                f.write(text)
    except Exception as e:
        print(f"Error reading {path}: {e}")

if __name__ == "__main__":
    inspect_pdf("english/4ea1-01-rms-20210604.pdf", "scratch/ms_inspect.txt")
    inspect_pdf("english/4ea1-01-que-20220519.pdf", "scratch/qp_inspect.txt")
