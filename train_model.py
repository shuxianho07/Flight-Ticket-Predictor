import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
import joblib  # This allows us to save the trained model

# 1. Load the "Experience" (The Data)
print("Loading data...")
df = pd.read_csv('flight_training_data.csv')

# 2. Separate the Inputs (X) from the Answer (y)
# Inputs: Everything EXCEPT the Target_Action
X = df[['Days_Until_Flight', 'Search_Velocity', 'Seasonality', 'Current_Price']]
# Answer: Only the Target_Action (1 = Buy, 0 = Wait)
y = df['Target_Action']

# 3. Split the data: 80% for studying (Training), 20% for the exam (Testing)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 4. Initialize the "Brain" (Random Forest)
# A Random Forest asks 100 little decision trees for their opinion and takes the majority vote.
# It is excellent for messy human behavior data like flight prices.
model = RandomForestClassifier(n_estimators=100, random_state=42)

# 5. Train the model
print("Training the model...")
model.fit(X_train, y_train)

# 6. Test the model
# We give it the exam questions (X_test) and see if its answers match the real answers (y_test)
predictions = model.predict(X_test)
accuracy = accuracy_score(y_test, predictions)

print(f"Model Accuracy: {accuracy * 100:.2f}%")

# 7. Save the trained brain to a file
# We will need this file later for our C# or C++ App
joblib.dump(model, 'flight_model.pkl')
print("Model saved to 'flight_model.pkl'")