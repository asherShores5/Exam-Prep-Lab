import argparse
import json
import re
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import logging

class ExamParser:
    def __init__(self, output_file: str = None, append: bool = False):
        """
        Initialize the exam parser.
        
        Args:
            output_file: JSON file to save results
            append: Whether to append to existing output file
        """
        self.output_file = output_file
        self.append = append
        
        # Set up logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger(__name__)

    def convert_letters_to_indices(self, answer_letters: str) -> List[int]:
        """Convert answer letters (e.g., 'CE') to zero-based indices."""
        return [ord(letter) - ord('A') for letter in answer_letters]

    def parse_question_card(self, card_soup) -> Optional[Dict]:
        """Parse a single question card from BeautifulSoup element."""
        try:
            # Extract question text
            question_text = card_soup.find('p', class_='card-text')
            if not question_text:
                return None
            question_text = question_text.get_text(strip=True)
            
            # Extract options
            options = []
            choices_container = card_soup.find('div', class_='question-choices-container')
            if choices_container:
                for li in choices_container.find_all('li', class_='multi-choice-item'):
                    # Get the text content
                    option_text = li.get_text(strip=True)
                    # Remove the letter prefix (e.g., "A.", "B.")
                    option_text = re.sub(r'^[A-F]\.\s*', '', option_text)
                    options.append(option_text)
            
            # Find correct answers
            correct_answers = []
            correct_answer_span = card_soup.find('span', class_='correct-answer')
            if correct_answer_span:
                # Get answer letters (e.g., "CE")
                answer_letters = correct_answer_span.get_text(strip=True)
                # Convert to indices
                correct_answers = self.convert_letters_to_indices(answer_letters)
            
            # Extract explanation
            explanation = ""
            answer_description = card_soup.find('span', class_='answer-description')
            if answer_description:
                explanation = answer_description.get_text(strip=True)
            
            return {
                "question": question_text,
                "options": options,
                "correctAnswers": correct_answers,
                "explanation": explanation
            }
        except Exception as e:
            self.logger.error(f"Error parsing question card: {str(e)}")
            return None

    def load_existing_json(self) -> List[Dict]:
        """Load existing JSON file if it exists."""
        try:
            if self.output_file:
                with open(self.output_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            self.logger.warning(f"Error loading existing JSON: {str(e)}")
        return []

    def save_questions(self, questions: List[Dict]):
        """Save questions to JSON file."""
        if self.output_file:
            if self.append:
                existing_questions = self.load_existing_json()
                questions = existing_questions + questions
                self.logger.info(f"Appending {len(questions) - len(existing_questions)} new questions to existing {len(existing_questions)} questions.")
            
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(questions, f, indent=2, ensure_ascii=False)
            self.logger.info(f"Saved {len(questions)} questions to {self.output_file}")
        else:
            print(json.dumps(questions, indent=2, ensure_ascii=False))

    def parse_html_file(self, html_file: str):
        """Parse questions from a local HTML file."""
        try:
            self.logger.info(f"Reading HTML file: {html_file}")
            
            # Read and parse HTML file
            with open(html_file, 'r', encoding='utf-8') as f:
                soup = BeautifulSoup(f.read(), 'html.parser')
            
            # Find all question cards
            question_cards = soup.find_all('div', class_='exam-question-card')
            self.logger.info(f"Found {len(question_cards)} question cards")
            
            # Parse questions
            questions = []
            for i, card in enumerate(question_cards, 1):
                # self.logger.info(f"Parsing question {i} of {len(question_cards)}")
                question_data = self.parse_question_card(card)
                if question_data:
                    questions.append(question_data)
            
            self.save_questions(questions)
            
        except Exception as e:
            self.logger.error(f"Error parsing HTML file: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description='Parse exam questions from a local HTML file')
    parser.add_argument('html_file', help='Path to HTML file')
    parser.add_argument('--output', '-o', help='Output JSON file path (optional)')
    parser.add_argument('--append', '-a', action='store_true', 
                       help='Append to existing output file instead of overwriting')
    
    args = parser.parse_args()
    
    exam_parser = ExamParser(
        output_file=args.output,
        append=args.append
    )
    
    try:
        exam_parser.parse_html_file(args.html_file)
    except KeyboardInterrupt:
        print("\nParsing interrupted by user")
    except Exception as e:
        print(f"Error during parsing: {str(e)}")

if __name__ == "__main__":
    main()