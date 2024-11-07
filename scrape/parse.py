import argparse
from bs4 import BeautifulSoup
import json
import re
import os

def parse_exam_questions(html_content):
    """Parse exam questions from HTML content and return structured data."""
    soup = BeautifulSoup(html_content, 'html.parser')
    questions = []
    
    # Find all question cards
    question_cards = soup.find_all('div', class_='exam-question-card')
    
    for card in question_cards:
        # Extract question text
        question_text = card.find('p', class_='card-text').get_text(strip=True)
        
        # Extract options
        options = []
        choices_container = card.find('div', class_='question-choices-container')
        if choices_container:
            for li in choices_container.find_all('li', class_='multi-choice-item'):
                # Remove the option letter (A., B., etc.) from the beginning
                option_text = li.get_text(strip=True)
                option_text = re.sub(r'^[A-D]\.\s*', '', option_text)
                options.append(option_text)
        
        # Find correct answer
        correct_answer = None
        correct_answer_span = card.find('span', class_='correct-answer')
        if correct_answer_span:
            correct_letter = correct_answer_span.get_text(strip=True)
            # Convert letter (A, B, C, D) to index (0, 1, 2, 3)
            correct_answer = ord(correct_letter) - ord('A')
        
        # Extract explanation (if available)
        explanation = ""
        answer_description = card.find('span', class_='answer-description')
        if answer_description:
            explanation = answer_description.get_text(strip=True)
        
        question_data = {
            "question": question_text,
            "options": options,
            "correctAnswer": correct_answer,
            "explanation": explanation
        }
        
        questions.append(question_data)
    
    return questions

def load_existing_json(file_path):
    """Load existing JSON file if it exists, return empty list if it doesn't."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def main():
    parser = argparse.ArgumentParser(description='Parse exam questions from HTML file')
    parser.add_argument('input_file', help='Path to the HTML file')
    parser.add_argument('--output', '-o', help='Output JSON file path (optional)')
    parser.add_argument('--append', '-a', action='store_true', 
                       help='Append to existing output file instead of overwriting')
    
    args = parser.parse_args()
    
    try:
        with open(args.input_file, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        new_questions = parse_exam_questions(html_content)
        
        if args.output:
            if args.append and os.path.exists(args.output):
                # Load existing questions and append new ones
                existing_questions = load_existing_json(args.output)
                combined_questions = existing_questions + new_questions
                output_json = json.dumps(combined_questions, indent=2)
                print(f"Appending {len(new_questions)} questions to existing {len(existing_questions)} questions.")
            else:
                output_json = json.dumps(new_questions, indent=2)
                if args.append:
                    print(f"Output file didn't exist. Creating new file with {len(new_questions)} questions.")
                
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(output_json)
        else:
            print(json.dumps(new_questions, indent=2))
            
    except FileNotFoundError:
        print(f"Error: Could not find file '{args.input_file}'")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()