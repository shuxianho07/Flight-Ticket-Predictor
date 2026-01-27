import pandas as pd
import numpy as np
import random

# --- CONFIGURATION ---
NUM_SAMPLES = 10000
BASE_PRICE = 300  # Average price of a ticket

def generate_flight_data():
    data = []

    for _ in range(NUM_SAMPLES):
        # 1. Simulate "Days Until Flight" (0 to 120 days out)
        days_until = random.randint(1, 120)

        # 2. Simulate "Search Velocity" (Interest)
        # Random base interest + spike if close to flight date
        search_vol = random.randint(50, 500) 
        if days_until < 30: 
            search_vol += random.randint(100, 300) # Panic searching close to date

        # 3. Simulate "Seasonality" (1 = High Season, 0 = Low Season)
        seasonality = random.choice([0, 1])

        # 4. PRICING ALGORITHM (The "Ground Truth" we want our ML to learn)
        # Start with base price
        price = BASE_PRICE
        
        # Rule A: Prices skyrocket 14 days before
        if days_until < 14:
            price *= 1.5
        elif days_until < 7:
            price *= 2.0
            
        # Rule B: High Search Volume + High Seasonality = Price Hike
        if search_vol > 600 and seasonality == 1:
            price *= 1.3
            
        # Rule C: "The Dip" - High Search, but 45-60 days out? Discount to lock them in.
        if 45 <= days_until <= 60 and search_vol > 400:
            price *= 0.85

        # Add some random noise (Market volatility)
        price += np.random.normal(0, 20)
        
        # 5. Determine the "Optimal Action" (The Label)
        # In a real scenario, we'd look into the future. 
        # Here, we simplify: If price is < Base Price * 1.1, it's a "Buy". Else "Wait".
        target = 1 if price < (BASE_PRICE * 1.1) else 0 # 1 = Buy, 0 = Wait

        data.append([days_until, search_vol, seasonality, round(price, 2), target])

    # Create DataFrame
    columns = ['Days_Until_Flight', 'Search_Velocity', 'Seasonality', 'Current_Price', 'Target_Action']
    df = pd.DataFrame(data, columns=columns)
    
    return df

# --- EXECUTION ---
print("Generating Synthetic Flight Data...")
df = generate_flight_data()

# Save to CSV
df.to_csv('flight_training_data.csv', index=False)
print("SUCCESS: 'flight_training_data.csv' created with 10,000 records.")
print(df.head())