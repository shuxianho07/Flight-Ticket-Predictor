import pandas as pd
import numpy as np
import random
from sklearn.ensemble import RandomForestClassifier
from skl2onnx import to_onnx
from skl2onnx.common.data_types import FloatTensorType

print("--- PHASE 1: LOAD & CLEAN ---")

try:
    df = pd.read_csv('amCharts.csv')
    df['clean_month'] = df['year'].astype(str).str.split('\n').str[0].str.strip()
    month_map = {'Jan':1,'Feb':2,'Mar':3,'Apr':4,'May':5,'Jun':6,'Jul':7,'Aug':8,'Sep':9,'Oct':10,'Nov':11,'Dec':12}
    df = df[df['clean_month'].isin(month_map.keys())].copy()
    df['Month'] = df['clean_month'].map(month_map)
    df['price'] = pd.to_numeric(df['price'], errors='coerce')
    df = df.dropna(subset=['price', 'Month'])
except:
    print(" Error: amCharts.csv not found!")
    exit()

# --- PHASE 2: TEACHER CORRECTIONS ---
teacher_corrections = [
    # REPORTED BUGS:
    [78, 4, 2, 350, 1], # April 14 (78 days out) @ 350 -> BUY
    [78, 4, 2, 320, 1], # April 14 (78 days out) @ 320 -> BUY

    # Group 1: Sweet Spots
    [45, 3, 2, 370, 1],
    [45, 3, 2, 300, 1],
    [45, 4, 2, 320, 1],
    [45, 1, 2, 450, 1],
    [45, 2, 2, 520, 1],

    # Group 2: Rip-Offs
    [45, 3, 2, 600, 0],
    [45, 4, 2, 700, 0],
    [45, 1, 2, 700, 0],
    [45, 2, 2, 850, 0],
    [45, 3, 2, 500, 0],

    # Group 3: Too Early
    [150, 3, 2, 500, 0],
    [120, 4, 2, 600, 0],
    [200, 2, 2, 650, 0],
    [100, 1, 2, 550, 0],

    # Group 4: Panic Buy
    [3, 2, 2, 900, 1],
    [2, 3, 2, 600, 1],
    [5, 4, 2, 500, 1],
    [1, 1, 2, 700, 1],
    [7, 2, 2, 800, 1]
]

print(f"Applying {len(teacher_corrections)} corrections...")
correction_data = []
for case in teacher_corrections:
    # Repeat 100 times to force the AI to memorize these rules
    for _ in range(100):
        correction_data.append(case)

# --- PHASE 3: GENERATE SYNTHETIC SCENARIOS ---
synthetic_data = []

print("Generating smart scenarios...")
for _, row in df.iterrows():
    base_price = row['price']
    month = row['Month']
    
    for _ in range(500):
        days_until = random.randint(1, 120)
        
        # LOGIC 1: THE SWEET SPOT (20-60 Days) -> Generally Good
        if 20 <= days_until <= 60:
            simulated_price = base_price * random.uniform(0.90, 1.10)
            # If price is reasonable (not a huge spike), BUY
            if simulated_price < (base_price * 1.1):
                is_good_deal = 1
            else:
                is_good_deal = 0

        # LOGIC 2: TOO EARLY (> 60 Days) -> The "Early Bird" Logic
        elif days_until > 60:
            # Usually expensive/average this far out
            simulated_price = base_price * random.uniform(1.0, 1.3)
            
            # Even if it's early, if the price is objectively CHEAP (< 380), BUY
            if simulated_price < 380:
                is_good_deal = 1
            else:
                is_good_deal = 0 # Otherwise, wait for the sweet spot
            
        # LOGIC 3: PANIC MODE (< 20 Days) -> Last Minute
        else: 
            # Prices spike
            simulated_price = base_price * random.uniform(1.2, 2.0)
            # You have no choice, Buy unless it's insane (> $900)
            if simulated_price < 900:
                is_good_deal = 1
            else:
                is_good_deal = 0 

        synthetic_data.append([days_until, month, 2, simulated_price, is_good_deal])

# MERGE
full_data = synthetic_data + correction_data
train_df = pd.DataFrame(full_data, columns=['Days_Until', 'Month', 'Dest_Type', 'Price', 'Target'])

print(f"Training on {len(train_df)} scenarios.")

# ---  PHASE 4: TRAIN ---
X = train_df[['Days_Until', 'Month', 'Dest_Type', 'Price']]
y = train_df['Target']

# Softer settings for better confidence scores
model = RandomForestClassifier(
    n_estimators=100, 
    max_depth=8,            # Increased depth slightly to catch the "Early Bird" rule
    min_samples_leaf=5,     # Less strict so it respects exceptions
    random_state=42
)
model.fit(X, y)

# --- EXPORT ---
initial_type = [('X', FloatTensorType([None, 4]))]
onx = to_onnx(model, X[:1].to_numpy(), initial_types=initial_type, options={'zipmap': False})

with open("flight_model.onnx", "wb") as f:
    f.write(onx.SerializeToString())

print("Model exported! April 14 @ $350 should now be a BUY with good confidence.")