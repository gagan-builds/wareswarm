import os
import sys

# Re-export from root scripts/seed_demo.py
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from seed_demo import seed_database

if __name__ == "__main__":
    seed_database()
