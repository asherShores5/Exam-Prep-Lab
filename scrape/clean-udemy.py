import json

def clean_question_data(input_data):
    """
    Cleans question data by removing entries with fewer than 4 options.
    
    Args:
        input_data (list): List of question dictionaries
        
    Returns:
        tuple: (cleaned_data, removed_count, validation_report)
    """
    cleaned_data = []
    removed_entries = []
    
    for index, entry in enumerate(input_data):
        # Validate options
        if 'options' not in entry:
            removed_entries.append({
                'index': index,
                'reason': 'Missing options field',
                'question': entry.get('question', 'No question text')
            })
            continue
            
        if not isinstance(entry['options'], list):
            removed_entries.append({
                'index': index,
                'reason': 'Options is not a list',
                'question': entry.get('question', 'No question text')
            })
            continue
            
        if len(entry['options']) < 4:
            removed_entries.append({
                'index': index,
                'reason': f'Insufficient options (found {len(entry["options"])})',
                'question': entry.get('question', 'No question text')
            })
            continue
            
        # Entry is valid, keep it
        cleaned_data.append(entry)
    
    # Create validation report
    validation_report = {
        'total_entries': len(input_data),
        'valid_entries': len(cleaned_data),
        'removed_entries': len(removed_entries),
        'removed_details': removed_entries
    }
    
    return cleaned_data, validation_report

def process_file(input_file, output_file):
    """
    Process a JSON file, clean the data, and save to a new file.
    
    Args:
        input_file (str): Path to input JSON file
        output_file (str): Path to output JSON file
        
    Returns:
        dict: Validation report
    """
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        cleaned_data, validation_report = clean_question_data(data)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(cleaned_data, f, indent=2, ensure_ascii=False)
            
        return validation_report
        
    except json.JSONDecodeError as e:
        return {'error': f'Invalid JSON format: {str(e)}'}
    except Exception as e:
        return {'error': f'Unexpected error: {str(e)}'}

# Example usage
if __name__ == "__main__":
    report = process_file('sorted_udemy.json', 'cleaned_udemy.json')
    print("File Processing Complete")