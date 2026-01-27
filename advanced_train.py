import pandas as pd
import numpy as np
import random
from sklearn.ensemble import GradientBoostingClassifier
from skl2onnx import to_onnx
from skl2onnx.common.data_types import FloatTensorType

print("Generating 10,000 flight records (Deep Discounts)...")

data = []
for _ in range(10000):
    days_until = random.randint(1, 120)
    month = random.randint(1, 12)
    dest_type = random.choice([0, 1, 2]) # 0=Cold, 1=City, 2=Hot
    
    # 1. Establish the "Fair" Price
    fair_price = 300 
    if month in [1, 2, 12] and dest_type == 2:
        fair_price = 900  # Cancun in Winter
    elif month in [1, 2] and dest_type == 0:
        fair_price = 150  # Winnipeg in Winter

    # 2. GENERATE SCENARIOS
    rand_val = random.random()

    if rand_val < 0.20:
        # SCENARIO A: RIP-OFF (20%)
        # Price is double the fair price
        actual_price = fair_price * 2.0 
        should_buy = 0 # WAIT
        
    elif rand_val < 0.40:
        # SCENARIO B: DEEP DISCOUNT (20%)
        # Price is HALF the fair price (50% OFF)
        # Cancun ($900) becomes $450. The AI will now recognize $500 as a deal.
        actual_price = fair_price * 0.5 
        should_buy = 1 # BUY
        
    else:
        # SCENARIO C: NORMAL MARKET (60%)
        actual_price = fair_price + random.randint(-50, 50)
        should_buy = 1 if actual_price < fair_price else 0

    # Safety to prevent negative prices
    if actual_price < 50: actual_price = 50

    data.append([days_until, month, dest_type, actual_price, should_buy])

columns = ['Days_Until', 'Month', 'Dest_Type', 'Price', 'Target']
df = pd.DataFrame(data, columns=columns)

# --- TRAINING ---
print("Training Deep Learning Brain...")
X = df[['Days_Until', 'Month', 'Dest_Type', 'Price']]
y = df['Target']

model = GradientBoostingClassifier(n_estimators=100, max_depth=5, random_state=42)
model.fit(X, y)

# --- HYPOTHESIS TEST ---
print("\n---  HYPOTHESIS TEST ---")
print("Scenario: It is January. You see a ticket for $500.")

# Case A: Cancun (Fair is $900). $500 is close to our 50% off data ($450).
test_snowbird = [[30, 1, 2, 500]] 
pred_snowbird = model.predict(test_snowbird)[0]
print(f"Cancun (Hot): AI says {'BUY NOW! (Deal)' if pred_snowbird==1 else 'WAIT'}")

# Case B: Winnipeg (Fair is $150). $500 is a rip-off.
test_cold = [[30, 1, 0, 500]]
pred_cold = model.predict(test_cold)[0]
print(f"Winnipeg (Cold): AI says {'BUY NOW' if pred_cold==1 else 'WAIT (Rip-off)'}")

if pred_snowbird == 1 and pred_cold == 0:
    print("\n SUCCESS: The AI understands Value!")
else:
    print("\n FAIL: Still confused.")

# --- EXPORT ---
initial_type = [('X', FloatTensorType([None, 4]))]
onx = to_onnx(model, X[:1].to_numpy(), initial_types=initial_type, options={'zipmap': False})

with open("flight_model.onnx", "wb") as f:
    f.write(onx.SerializeToString())