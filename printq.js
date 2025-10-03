// ===============================
// Supabase Configuration
// ===============================
const SUPABASE_URL = "https://jinzxvyzakgdejrjqoqe.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppbnp4dnl6YWtnZGVqcmpxb3FlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzU3MDksImV4cCI6MjA3NDMxMTcwOX0.6siGvmt5PTa_O-HkfJraS7ReVSFz2rDa6hKyH7fD_1U"; 
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===============================
// Global State
// ===============================
let uploadedFile = null;
let calculatedCost = 0;
let generatedPrintCode = "";

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

  if (deliveryOption && deliveryOption.value === "delivery" && !location.trim()) {
    alert("Enter your location for delivery.");
    return;
  }

  if (calculatedCost === 0) {
    calculateCost();
  }

  generatedPrintCode =
    "PRINT-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1000);

  const uploadPath = `${generatedPrintCode}-${uploadedFile.name}`;
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

  const { error: insertError } = await supabase
    .from("prints")
    .insert([{
      print_code: generatedPrintCode,
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
    alert("Failed to save print in database: " + insertError.message);
    return;
  }

  alert(`File uploaded successfully!`);

  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("paymentSection").classList.remove("hidden");
}

// ===============================
// Upload Receipt (Show Print Code)
// ===============================
async function uploadReceipt(e) {
  e.preventDefault();

  const receiptFile = document.getElementById("receipt").files[0];
  const refNumber = document.getElementById("refNumber").value;

  if (!receiptFile || !refNumber) {
    alert("Upload receipt and enter reference number.");
    return;
  }

  const receiptPath = `${generatedPrintCode}-receipt-${receiptFile.name}`;
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

  const { data: printData } = await supabase
    .from("prints")
    .select("id")
    .eq("print_code", generatedPrintCode)
    .single();

  if (!printData) {
    alert("Print not found for receipt upload.");
    return;
  }

  await supabase
    .from("receipts")
    .insert([{
      print_id: printData.id,
      receipt_url: receiptUrl
    }]);

  await supabase
    .from("prints")
    .update({ reference_number: refNumber })
    .eq("print_code", generatedPrintCode);

  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.background = "#fff";
  popup.style.padding = "20px";
  popup.style.border = "2px solid #003366";
  popup.style.borderRadius = "10px";
  popup.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
  popup.style.textAlign = "center";
  popup.style.zIndex = "9999";
  popup.innerHTML = `
    <p><strong>Your Print Code:</strong></p>
    <p style="font-size:18px; color:#003366; margin:10px 0;">${generatedPrintCode}</p>
    <button id="copyPrintCodeBtn" style="padding:8px 12px; border:none; background:#003366; color:#fff; border-radius:6px; cursor:pointer; margin-right:10px;">Copy Code</button>
    <button id="closePopupBtn" style="padding:8px 12px; border:none; background:#999; color:#fff; border-radius:6px; cursor:pointer;">Close</button>
  `;

  document.body.appendChild(popup);

  document.getElementById("copyPrintCodeBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(generatedPrintCode).then(() => {
      alert("Print Code copied to clipboard!");
    });
  });

  document.getElementById("closePopupBtn").addEventListener("click", () => {
    popup.remove();
  });

  document.getElementById("paymentSection").classList.add("hidden");
  document.getElementById("lookupSection").scrollIntoView({ behavior: "smooth" });
}

// ===============================
// Check Print Status
// ===============================
async function checkStatus(e) {
  e.preventDefault();

  const code = document.getElementById("lookupPrintId").value;
  if (!code) {
    alert("Enter your Print Code.");
    return;
  }

  const { data, error } = await supabase
    .from("prints")
    .select("status, reference_number, release_code, created_at, delivery_option, location")
    .eq("print_code", code)
    .single();

  if (error || !data) {
    alert("Print not found.");
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
    statusMessage = "Your print is ready for pickup.";
  } else if (data.status === "out for delivery") {
    statusMessage = "Your print is on the way!";
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
// Toggle Location Field + Auto Cost Update
// ===============================
const locationLabel = document.querySelector('label[for="location"]');
const locationInput = document.getElementById("location");

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
      locationInput.value = "";
    }
    calculateCost();
  });
});
