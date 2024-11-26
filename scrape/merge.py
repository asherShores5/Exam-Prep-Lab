import json

def merge_json_files(file1_path, file2_path, output_path):
    """
    Merge two JSON files containing quiz questions, avoiding duplicates based on question text.
    Handles domain entries (entries with empty options) separately.
    """
    # Read both JSON files with UTF-8 encoding
    with open(file1_path, 'r', encoding='utf-8') as f1:
        data1 = json.load(f1)
    
    with open(file2_path, 'r', encoding='utf-8') as f2:
        data2 = json.load(f2)
    
    # Create separate dictionaries for questions and domains
    question_dict = {}
    domain_dict = {}
    duplicates = 0
    
    # Helper function to process items
    def process_items(items):
        nonlocal duplicates
        for item in items:
            # Check if it's a domain entry
            is_domain = len(item['options']) == 0 and len(item['correctAnswers']) == 0
            
            if is_domain:
                domain_dict[item['question']] = item
            else:
                if item['question'] in question_dict:
                    duplicates += 1
                else:
                    question_dict[item['question']] = item
    
    # Process both files
    process_items(data1)
    process_items(data2)
    
    # Combine questions and domains
    merged_data = list(question_dict.values()) + list(domain_dict.values())
    
    # Sort by question text for consistency
    merged_data.sort(key=lambda x: x['question'])
    
    # Write merged data to output file with UTF-8 encoding
    with open(output_path, 'w', encoding='utf-8') as outfile:
        json.dump(merged_data, outfile, indent=2, ensure_ascii=False)
    
    return len(merged_data), duplicates

def print_merge_stats(file1_path, file2_path, output_path):
    """
    Print statistics about the merge operation
    """
    with open(file1_path, 'r', encoding='utf-8') as f1:
        count1 = len(json.load(f1))
    
    with open(file2_path, 'r', encoding='utf-8') as f2:
        count2 = len(json.load(f2))
    
    total_merged, duplicates = merge_json_files(file1_path, file2_path, output_path)
    
    print(f"\nMerge Statistics:")
    print(f"Questions in first file: {count1}")
    print(f"Questions in second file: {count2}")
    print(f"Duplicate questions found: {duplicates}")
    print(f"Total questions in merged file: {total_merged}")
    print(f"Merged file saved to: {output_path}")

if __name__ == "__main__":
    try:
        file1_path = "parsed_udemy_multiple_answers.json"
        file2_path = "out.json"
        output_path = "merged_questions.json"
        
        print_merge_stats(file1_path, file2_path, output_path)
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        # If it's a specific encoding error, print a helpful message
        if isinstance(e, UnicodeDecodeError):
            print("\nThis appears to be an encoding issue. Try checking your JSON files are properly UTF-8 encoded.")
            print("You can convert them using a text editor like Notepad++ or VSCode by opening the file and saving it with UTF-8 encoding.")