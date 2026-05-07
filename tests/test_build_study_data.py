from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_study_data import (  # type: ignore
    normalize_pdf_name,
    parse_formula_cards,
    parse_legacy_mcq_items,
    parse_new_style_mark_scheme_items,
    parse_question_paper_mcqs,
)


FORMULA_SAMPLE = """
Edexcel / Pearson GCSE Business — Year 11
Theme 1 & Theme 2 · Every formula that may appear on your exam paper
FORMULA NAME
FORMULA
NOTES / UNITS
■ 1 · Revenue, Costs & Profit
Total Revenue (TR)
TR = Price (P) × Quantity Sold (Q)
Answer in £
Total Costs (TC)
TC = Fixed Costs (FC) + Variable Costs
(VC)
Answer in £
■ 2 · Profit Margins (%)
Gross Profit Margin
GPM (%) = (Gross Profit ÷ Revenue) × 100
Express as %
"""


NEW_STYLE_MARK_SCHEME_SAMPLE = """
Question
Number
Which one of the following is a financial aim for a business?
Answer
Mark
1 (a) (ii) AO1 - 1 mark

The only correct answer is A - Survival

B - this is not correct because it is a non-financial aim
C - this is not correct because it is a non-financial aim
D - this is not correct because it is a non-financial aim (1)

Question
Number
Define the term primary sector.
Answer
Mark
1 (b) AO1 - 1 mark
Award 1 mark for a correct definition of primary sector.

• The extraction of raw materials from the earth (1).
(1)

Question
Number
Calculate the total costs for TBTS.
Answer
Additional guidance Mark
1 (e) Calculate the total costs for TBTS.

A02 - 2 marks

555.31 + (0.93 x 160) (1)

= 704.11 (1)
"""


LEGACY_QUESTION_SAMPLE = """
(a) (i) Which of the following is an element of the marketing mix?
(1)
     A Pay
     B Price
     C Profit
     D Productivity *S56104A0215* Turn over 2
  (ii) Which of the following terms describes a situation where a worker is given the
authority to carry out a task that a manager would normally do?
(1)
     A Job rotation
     B Job share
     C Part-time employment
     D Delegation
"""


LEGACY_MARK_SCHEME_SAMPLE = """
1(a) (i) AO1 1 mark

B Price

(1)

Question
number
Answer Mark
1(a) (ii) AO1 1 mark

D Delegation

(1)
"""


QUESTION_PAPER_SPILLOVER_SAMPLE = """
  (v) W hich one of the following is the closing cash balance for Haji Biriyani at the end of April 2016? S elect one answer.
(1)
     A -1 600 000 Tks
     B -200 000 Tks
     C 2 600 000 Tks
     D 5 400 000 Tks
  Haji Biriyani needs to import 20kg of black peppercorns from India.
"""


class BuildStudyDataTests(unittest.TestCase):
    def test_normalize_pdf_name_removes_download_suffix(self):
        self.assertEqual(normalize_pdf_name("4BS1_01_0625_MS (2).pdf"), "4BS1_01_0625_MS.pdf")

    def test_parse_formula_cards_keeps_name_formula_and_notes(self):
        cards = parse_formula_cards(FORMULA_SAMPLE)

        self.assertEqual(
            [card["name"] for card in cards],
            ["Total Revenue (TR)", "Total Costs (TC)", "Gross Profit Margin"],
        )
        self.assertEqual(cards[0]["formula"], "TR = Price (P) × Quantity Sold (Q)")
        self.assertEqual(cards[1]["formula"], "TC = Fixed Costs (FC) + Variable Costs (VC)")
        self.assertEqual(cards[2]["notes"], "Express as %")

    def test_parse_new_style_mark_scheme_items_extracts_multiple_item_types(self):
        items = parse_new_style_mark_scheme_items(NEW_STYLE_MARK_SCHEME_SAMPLE, source_label="4BS1/01 June 2022")

        self.assertEqual([item["type"] for item in items], ["mcq", "definition", "calculation"])
        self.assertEqual(items[0]["answer_letter"], "A")
        self.assertEqual(items[0]["answer_text"], "Survival")
        self.assertEqual(items[1]["prompt"], "Define the term primary sector.")
        self.assertIn("raw materials from the earth", items[1]["mark_scheme"])
        self.assertEqual(items[2]["answer_text"], "704.11")
        self.assertIn("555.31 + (0.93 x 160)", items[2]["working"])

    def test_parse_legacy_mcq_items_pairs_questions_with_answers(self):
        items = parse_legacy_mcq_items(
            LEGACY_QUESTION_SAMPLE,
            LEGACY_MARK_SCHEME_SAMPLE,
            source_label="4BS1/01 Sample",
        )

        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["type"], "mcq")
        self.assertEqual(items[0]["answer_letter"], "B")
        self.assertEqual(items[0]["answer_text"], "Price")
        self.assertEqual(items[0]["options"][3], "Productivity")
        self.assertEqual(items[1]["answer_letter"], "D")
        self.assertIn("authority to carry out a task", items[1]["prompt"])

    def test_parse_question_paper_mcqs_strips_following_case_study_text(self):
        items = parse_question_paper_mcqs(QUESTION_PAPER_SPILLOVER_SAMPLE)

        self.assertEqual(
            items[0]["prompt"],
            "Which one of the following is the closing cash balance for Haji Biriyani at the end of April 2016? Select one answer.",
        )
        self.assertEqual(items[0]["options"][3], "5 400 000 Tks")


if __name__ == "__main__":
    unittest.main()
