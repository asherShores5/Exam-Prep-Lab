import argparse
import json
import re
import os
import time
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import logging
from typing import List, Dict, Optional

class ExamScraper:
    def __init__(self, base_url: str, output_file: str = None, append: bool = False,
                 delay: float = 1.0, timeout: int = 30):
        """
        Initialize the exam scraper.
        
        Args:
            base_url: Starting URL to scrape
            output_file: JSON file to save results
            append: Whether to append to existing output file
            delay: Delay between actions in seconds
            timeout: Maximum time to wait for elements in seconds
        """
        self.base_url = base_url
        self.output_file = output_file
        self.append = append
        self.delay = delay
        self.timeout = timeout
        
        # Set up logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger(__name__)
        
        # Initialize browser
        self.setup_browser()

    def setup_browser(self):
        """Set up the Selenium WebDriver with Chrome."""
        options = webdriver.ChromeOptions()
        # Uncomment the line below to run in headless mode (no GUI)
        # options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--window-size=1420,1080')
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-dev-shm-usage')
        self.driver = webdriver.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, self.timeout)

    def handle_captcha(self):
        """Look for and click any 'I'm not a robot' buttons or similar captcha elements."""
        try:
            # Common patterns for captcha/verification buttons
            captcha_patterns = [
                "//button[contains(text(), 'not a robot')]",
                "//button[contains(text(), 'verify')]",
                "//button[contains(text(), 'continue')]",
                "//div[contains(@class, 'captcha')]//button",
                # Add more XPath patterns as needed
            ]
            
            for pattern in captcha_patterns:
                try:
                    button = self.wait.until(
                        EC.element_to_be_clickable((By.XPATH, pattern))
                    )
                    self.logger.info(f"Found captcha button using pattern: {pattern}")
                    button.click()
                    time.sleep(self.delay)  # Wait for any animations/transitions
                    return True
                except TimeoutException:
                    continue
            
            self.logger.warning("No captcha button found with known patterns")
            return False
            
        except Exception as e:
            self.logger.error(f"Error handling captcha: {str(e)}")
            return False

    def wait_for_content(self):
        """Wait for exam content to load."""
        try:
            # Wait for question cards to be present
            self.wait.until(
                EC.presence_of_element_located((By.CLASS_NAME, "exam-question-card"))
            )
            return True
        except TimeoutException:
            self.logger.error("Timeout waiting for exam content to load")
            return False

    def parse_question_card(self, card_element) -> Optional[Dict]:
        """Parse a single question card from Selenium element."""
        try:
            # Convert to string and use BeautifulSoup for easier parsing
            card_html = card_element.get_attribute('outerHTML')
            soup = BeautifulSoup(card_html, 'html.parser')
            
            # Extract question text
            question_text = soup.find('p', class_='card-text').get_text(strip=True)
            
            # Extract options
            options = []
            choices_container = soup.find('div', class_='question-choices-container')
            if choices_container:
                for li in choices_container.find_all('li', class_='multi-choice-item'):
                    option_text = li.get_text(strip=True)
                    option_text = re.sub(r'^[A-D]\.\s*', '', option_text)
                    options.append(option_text)
            
            # Find correct answer
            correct_answer = None
            correct_answer_span = soup.find('span', class_='correct-answer')
            if correct_answer_span:
                correct_letter = correct_answer_span.get_text(strip=True)
                correct_answer = ord(correct_letter) - ord('A')
            
            # Extract explanation
            explanation = ""
            answer_description = soup.find('span', class_='answer-description')
            if answer_description:
                explanation = answer_description.get_text(strip=True)
            
            return {
                "question": question_text,
                "options": options,
                "correctAnswer": correct_answer,
                "explanation": explanation
            }
        except Exception as e:
            self.logger.error(f"Error parsing question card: {str(e)}")
            return None

    def load_existing_json(self) -> List[Dict]:
        """Load existing JSON file if it exists."""
        try:
            if self.output_file and os.path.exists(self.output_file):
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
                json.dump(questions, f, indent=2)
            self.logger.info(f"Saved {len(questions)} questions to {self.output_file}")
        else:
            print(json.dumps(questions, indent=2))

    def scrape(self):
        """Main scraping method."""
        try:
            self.logger.info(f"Starting scrape of {self.base_url}")
            
            # Load the page
            self.driver.get(self.base_url)
            time.sleep(self.delay)  # Wait for initial load
            
            # Handle captcha if present
            self.handle_captcha()
            
            # Wait for content to load
            if not self.wait_for_content():
                self.logger.error("Failed to load exam content")
                return
            
            # Find all question cards
            question_cards = self.driver.find_elements(By.CLASS_NAME, "exam-question-card")
            self.logger.info(f"Found {len(question_cards)} question cards")
            
            # Parse questions
            questions = []
            for card in question_cards:
                question_data = self.parse_question_card(card)
                if question_data:
                    questions.append(question_data)
            
            self.save_questions(questions)
            
        except Exception as e:
            self.logger.error(f"Error during scraping: {str(e)}")
        finally:
            self.driver.quit()

def main():
    parser = argparse.ArgumentParser(description='Scrape exam questions from a website')
    parser.add_argument('url', help='URL to scrape')
    parser.add_argument('--output', '-o', help='Output JSON file path (optional)')
    parser.add_argument('--append', '-a', action='store_true', 
                       help='Append to existing output file instead of overwriting')
    parser.add_argument('--delay', '-d', type=float, default=1.0,
                       help='Delay between actions in seconds (default: 1.0)')
    parser.add_argument('--timeout', '-t', type=int, default=30,
                       help='Maximum time to wait for elements in seconds (default: 30)')
    
    args = parser.parse_args()
    
    scraper = ExamScraper(
        base_url=args.url,
        output_file=args.output,
        append=args.append,
        delay=args.delay,
        timeout=args.timeout
    )
    
    try:
        scraper.scrape()
    except KeyboardInterrupt:
        print("\nScraping interrupted by user")
    except Exception as e:
        print(f"Error during scraping: {str(e)}")

if __name__ == "__main__":
    main()