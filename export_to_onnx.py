import pandas as pd
from skl2onnx import to_onnx
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

# 1. Load & Retrain
print("Retraining for export...")
df = pd.read_csv('flight_training_data.csv')
X = df[['Days_Until_Flight', 'Search_Velocity', 'Seasonality', 'Current_Price']]
y = df['Target_Action']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# 2. Convert to ONNX (WITH ZIPMAP DISABLED)
print("Converting to ONNX format (Clean Mode)...")
# FIX: 'zipmap': False tells it to output a simple Array, not a Dictionary
onx = to_onnx(model, X_train[:1].to_numpy(), options={'zipmap': False})

# 3. Save
with open("flight_model.onnx", "wb") as f:
    f.write(onx.SerializeToString())

print("SUCCESS: Model saved as 'flight_model.onnx'")