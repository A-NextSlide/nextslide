# Helper function to round floating point numbers to 2 decimal places
def round_numbers(obj):
    if isinstance(obj, float):
        return round(obj, 2)
    elif isinstance(obj, dict):
        return {k: round_numbers(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [round_numbers(item) for item in obj]
    else:
        return obj

