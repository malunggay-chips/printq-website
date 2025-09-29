// ===============================
// Supabase Configuration
// ===============================
const SUPABASE_URL = "https://jinzxvyzakgdejrjqoqe.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppbnp4dnl6YWtnZGVqcmpxb3FlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzU3MDksImV4cCI6MjA3NDMxMTcwOX0.6siGvmt5PTa_O-HkfJraS7ReVSfz2rDa6hKyH7fD_1U"; 
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===============================
// Global State
// ===============================
let uploadedFile = null;
let calculatedCost = 0;
let generatedJobCode = "";

// ===============================
// File Upload
// ===============================
function handleFileUpload(event) {
  uploadedFile = event.target.files[0];
  if (!uploadedFile) {
    alert("Please select a file to upload.");
    return;
  }
}

// ===============================
// Cost Calculation
// ===============================
function calculateCost() {
  const pages = parseInt(document.getElementById("pages").value);
  const copies = parseInt(document.getElementById("copies").value) || 1;
  const printType = document.querySelector('input[name="printType"]:checked');

  if (!pages || pages <= 0) {
    alert("Enter a valid number of pages.");
    return;
  }
  if (!printType) {
    alert("Select print type.");
    return;
  }

  const pricePerPage = printType.value === "bw" ? 5 : 10;
  calculatedCost = pages * copies * pricePerPage;

  // ✅ Add delivery fee if selected
  const deliveryOption = document.querySelector('input[name="deliveryOption"]:checked');
  if (deliveryOption && deliveryOption.value === "delivery") {
    calculatedCost += 20; 
  }

  document.getElementById("costDisplay").innerText =
    `Total Cost: ₱${calculatedCost}`;

  return calculatedCost;
}

// ===============================
// Proceed to Payment
// ===============================
async function proceedToPayment(e) {
  e.preventDefault();

  if (!uploadedFile) {
    alert("Upload your file first.");
    return;
  }

  const pages = parseInt(document.getElementById("pages").value);
  const copies = parseInt(document.getElementById("copies").value) || 1;
  const printType = document.querySelector('input[name="printType"]:checked');
  const deliveryOption = document.querySelector('input[name="deliveryOption"]:checked');
  const location = document.getElementById("location")?.value || "";

  if (!pages || !printType) {
    alert("Fill in all required fields.");
    return;
  }

  // 🚨 Require location if delivery is chosen
  if (deliveryOption && deliveryOption.value === "delivery" && !location.trim()) {
    alert("Enter your location for delivery.");
    return;
  }

  if (calculatedCost === 0) {
    calculateCost();
  }

  generatedJobCode =
    "JOB-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1000);

  // Upload file to Supabase Storage
  const uploadPath = `${generatedJobCode}-${uploadedFile.name}`;
  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from("print-files")
    .upload(uploadPath, uploadedFile, { upsert: true });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    alert("File upload failed: " + (uploadError.message || JSON.stringify(uploadError)));
    return;
  }

  const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/print-files/${uploadData.path}`;

  // Insert job into DB
  const { error: insertError } = await supabase
    .from("jobs")
    .insert([{
      job_code: generatedJobCode,
      filename: uploadedFile.name,
      file_url: fileUrl,
      pages: pages,
      copies: copies,
      print_type: printType.value,
      cost: calculatedCost,
      status: "pending",
      delivery_option: deliveryOption ? deliveryOption.value : "pickup",
      location: location
    }]);

  if (insertError) {
    console.error(insertError);
    alert("Failed to save job in database: " + insertError.message);
    return;
  }

  alert(`File uploaded successfully!\nYour Job Code: ${generatedJobCode}`);

  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("paymentSection").classList.remove("hidden");
}

// ===============================
// Upload Receipt
// ===============================
async function uploadReceipt(e) {
  e.preventDefault();

  const receiptFile = document.getElementById("receipt").files[0];
  const refNumber = document.getElementById("refNumber").value;

  if (!receiptFile || !refNumber) {
    alert("Upload receipt and enter reference number.");
    return;
  }

  const receiptPath = `${generatedJobCode}-receipt-${receiptFile.name}`;
  const { data: receiptData, error: receiptError } = await supabase
    .storage
    .from("receipts")
    .upload(receiptPath, receiptFile, { upsert: true });

  if (receiptError) {
    console.error("Receipt upload error:", receiptError);
    alert("Receipt upload failed: " + (receiptError.message || JSON.stringify(receiptError)));
    return;
  }

  const receiptUrl = `${SUPABASE_URL}/storage/v1/object/public/receipts/${receiptData.path}`;

  const { data: jobData } = await supabase
    .from("jobs")
    .select("id")
    .eq("job_code", generatedJobCode)
    .single();

  if (!jobData) {
    alert("Job not found for receipt upload.");
    return;
  }

  await supabase
    .from("receipts")
    .insert([{
      job_id: jobData.id,
      receipt_url: receiptUrl
    }]);

  await supabase
    .from("jobs")
    .update({ reference_number: refNumber })
    .eq("job_code", generatedJobCode);

  alert("Receipt uploaded. Your transaction is pending approval.");

  document.getElementById("paymentSection").classList.add("hidden");
  document.getElementById("lookupSection").scrollIntoView({ behavior: "smooth" });
}

// ===============================
// Check Job Status
// ===============================
async function checkStatus(e) {
  e.preventDefault();

  const code = document.getElementById("lookupJobId").value;
  if (!code) {
    alert("Enter your Job Code.");
    return;
  }

  const { data, error } = await supabase
    .from("jobs")
    .select("status, reference_number, release_code, created_at, delivery_option, location")
    .eq("job_code", code)
    .single();

  if (error || !data) {
    alert("Job not found.");
    return;
  }

  let statusClass = "";
  if (data.status === "approved") statusClass = "status-approved";
  else if (data.status === "rejected") statusClass = "status-rejected";
  else if (data.status === "ready for pickup") statusClass = "status-approved";
  else if (data.status === "out for delivery") statusClass = "status-approved";
  else statusClass = "status-pending";

  let statusMessage = data.status;
  if (data.status === "ready for pickup") {
    statusMessage = "Your print job is ready for pickup.";
  } else if (data.status === "out for delivery") {
    statusMessage = "Your print job is on the way!";
  }

  document.getElementById("lookupResult").innerHTML = `
    <p><strong>Status:</strong> <span class="${statusClass}">${statusMessage}</span></p>
    <p><strong>Reference #:</strong> ${data.reference_number || "N/A"}</p>
    <p><strong>Release Code:</strong> ${data.release_code || "N/A"}</p>
    <p><strong>Created:</strong> ${new Date(data.created_at).toLocaleString()}</p>
    <p><strong>Option:</strong> ${data.delivery_option || "pickup"}</p>
    <p><strong>Location:</strong> ${data.location || "N/A"}</p>
  `;
}

// ===============================
// Event Listeners
// ===============================
document.getElementById("file").addEventListener("change", handleFileUpload);
document.getElementById("calcBtn").addEventListener("click", calculateCost);
document.getElementById("uploadForm").addEventListener("submit", proceedToPayment);
document.getElementById("paymentForm").addEventListener("submit", uploadReceipt);
document.getElementById("lookupForm").addEventListener("submit", checkStatus);

// ===============================
// NEW: Toggle Location Field + Auto Cost Update
// ===============================
const locationLabel = document.querySelector('label[for="location"]');
const locationInput = document.getElementById("location");

// hide both by default
locationLabel.style.display = "none";
locationInput.style.display = "none";

document.querySelectorAll('input[name="deliveryOption"]').forEach(radio => {
  radio.addEventListener("change", () => {
    if (radio.value === "delivery" && radio.checked) {
      locationLabel.style.display = "block";
      locationInput.style.display = "block";
    } else if (radio.value === "pickup" && radio.checked) {
      locationLabel.style.display = "none";
      locationInput.style.display = "none";
      locationInput.value = ""; // clear when pickup
    }

    // ✅ Recalculate cost immediately when option changes
    calculateCost();
  });
});
