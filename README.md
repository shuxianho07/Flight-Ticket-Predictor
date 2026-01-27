# FlightJournal

**An Intelligent Flight Price Predictor.**

Feeling tired of winter in Canada? Let's book a trip to Cancun!

FlightJournal is a machine learning-powered application that helps travelers decide whether to **Buy Now** or **Wait** for a better deal from Toronto Pearson Airport to Cancun Airport. Unlike simple rule-based trackers, this program uses a hybrid **Random Forest** model trained on historical data in 2025, synthetic scenarios, and "User Corrections" to provide nuanced advice with confidence scores.

The interface features a **"Journal" aesthetic**, designed to make travel planning feel calm and organized rather than stressful.

---

## Features

* **Machine Learning Model:** Uses a Random Forest Classifier trained on real seasonality data and synthetic pricing scenarios.
* **Active Learning:** Implements Hard Example Mining to fix edge cases like "Early Bird" specials or "Panic Buying."
* **Visual Context:**
    * **Seasonality Bar Chart:** Shows historical average prices for every month.
    * **Price Meter:** A visual gauge showing if the current price is a Steal or a Rip-off.
* **Smart Advice:** Dynamic text generation explaining *why* you should buy or wait (e.g., "You are beating the market by $50" or "Wait until March").
* **High Performance:** The Python-trained model is exported to **ONNX** and runs continuously in a high-speed **.NET 8 Web API**.

---

## Tech Stack

### Data Science
* **Python:** Data processing and model training.
* **Scikit-Learn:** Random Forest implementation.
* **Pandas:** Data manipulation and synthetic data generation.
* **ONNX (Open Neural Network Exchange):** Used to port the model from Python to C#.

### Backend (The Engine)
* **C# / .NET 8:** Web API.
* **Microsoft.ML.OnnxRuntime:** Runs the AI model for real-time inference.

### Frontend (The Face)
* **HTML5 / CSS3:** Custom UI design system (including CSS Variables, Animations).
* **JavaScript (Vanilla):** Logic for API calls, meter calculations, and advice generation.
* **Chart.js:** Rendering the seasonality bar charts.

---

## Installation & Setup

### Prerequisites
* **Python 3.x** (with `pandas`, `scikit-learn`, `skl2onnx`)
* **.NET 8.0 SDK**

### Step 1: Train the Brain (Python)
Before the app can run, you must teach the AI and generate the brain file (`.onnx`).

1.  Navigate to the project root.
2.  Install dependencies:
    ```bash
    pip install pandas scikit-learn skl2onnx numpy
    ```
3.  Run the training script:
    ```bash
    python train_real_data.py
    ```
    *Output:* `Model exported! April 14 @ $350 should now be a BUY.`

### Step 2: Transplant the Brain
Copy the generated model into the API folder so the backend can access it.

* **Windows:**
    ```powershell
    copy flight_model.onnx FlightApi\
    ```
* **Mac/Linux:**
    ```bash
    cp flight_model.onnx FlightApi/
    ```

### Step 3: Launch the Application
1.  Navigate to the API folder:
    ```bash
    cd FlightApi
    ```
2.  Start the server:
    ```bash
    dotnet run --urls "http://localhost:5005"
    ```
3.  Open your browser and go to:
    **[http://localhost:5005](http://localhost:5005)**

---

## Project Structure

```text
FlightTicket/
│
├── train_real_data.py       # The Python Training Script (Run this first)
├── amCharts.csv             # The raw data source
├── flight_model.onnx        # The exported AI Brain (Generated file)
│
├── FlightApi/               # The .NET Backend Folder
│   ├── Program.cs           # C# API Logic (Loads ONNX, serves HTML)
│   ├── flight_model.onnx    # The copy of the brain used by the server
│   ├── FlightApi.csproj     # Project settings
│   │
│   └── wwwroot/             # The Frontend Folder
│       └── index.html       # The "Cozy Journal" UI & Logic
│
└── README.md                # This file
