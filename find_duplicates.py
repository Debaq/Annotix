import json
import sys
from collections import Counter

def find_duplicates(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # Simple line-based check for now to find line numbers
    lines = content.split('\n')
    
    # We need a stack to track current object context to be accurate
    # But for a quick check, let's try to use a custom decoder
    
    duplicates = []
    
    def dict_raise_on_duplicates(ordered_pairs):
        count = Counter(k for k, v in ordered_pairs)
        for k, v in ordered_pairs:
            if count[k] > 1:
                duplicates.append(k)
        return dict(ordered_pairs)

    try:
        json.loads(content, object_pairs_hook=dict_raise_on_duplicates)
    except Exception as e:
        print(f"Error parsing JSON: {e}")

    unique_duplicates = sorted(list(set(duplicates)))
    
    if not unique_duplicates:
        print("No duplicates found (by simple hook check).")
        return

    print(f"Found {len(unique_duplicates)} duplicate keys (names):")
    for key in unique_duplicates:
        print(f"- {key}")
        # Find line numbers
        for i, line in enumerate(lines):
            if f'"{key}"' in line:
                print(f"  Line {i+1}: {line.strip()}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python find_duplicates.py <filename>")
    else:
        find_duplicates(sys.argv[1])
