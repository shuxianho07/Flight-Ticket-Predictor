using Microsoft.ML;
using Microsoft.ML.Data;
using Microsoft.ML.Transforms.Onnx;
using System.IO; // Needed for file saving

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Load the Brain
string modelPath = "flight_model.onnx";
var mlContext = new MLContext();

var pipeline = mlContext.Transforms.ApplyOnnxModel(
    modelFile: modelPath,
    outputColumnNames: new[] { "label", "probabilities" }, 
    inputColumnNames: new[] { "X" } 
);

var transformer = pipeline.Fit(mlContext.Data.LoadFromEnumerable(new List<FlightInput>()));
var engine = mlContext.Model.CreatePredictionEngine<FlightInput, FlightPrediction>(transformer);

Console.WriteLine(" Smart Model Loaded!");

app.MapGet("/predict", (int days, int month, int destType, double price) =>
{
    // 1. Predict
    var inputData = new FlightInput 
    { 
        Features = new float[] { (float)days, (float)month, (float)destType, (float)price } 
    };
    
    var prediction = engine.Predict(inputData);
    string decision = prediction.PredictedLabel == 1 ? "BUY NOW" : "WAIT";
    float confidence = prediction.Probabilities[1]; 

    // 2. LOG THE DATA (The "Learning" Part)
    // We save what the user searched for. Later, we can use this to re-train!
    string logLine = $"{DateTime.Now},{days},{month},{destType},{price},{decision},{confidence}";
    File.AppendAllText("search_history.csv", logLine + Environment.NewLine);

    return new 
    { 
        Decision = decision, 
        Confidence = $"{confidence * 100:0.0}%",
        Reasoning = "Based on historical pricing patterns."
    };
});

app.Run();

class FlightInput
{
    [VectorType(4)]
    [ColumnName("X")]
    public float[] Features { get; set; } 
}

class FlightPrediction
{
    [ColumnName("label")]
    public long[] PredictedLabelArr { get; set; } 
    public long PredictedLabel => PredictedLabelArr[0];

    [ColumnName("probabilities")]
    public float[] Probabilities { get; set; }
}