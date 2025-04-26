let clicks = window.localStorage.getItem("clicks") || 0;
let pendingClicks = 0;
let isUpdating = false;
let estimatedGlobalClicks = 0;
const BATCH_SIZE = 10; // Number of clicks to batch before sending to server
const ephemeralURL =
  "https://spotty-mails-wave.loca.lt";

function showResetMessage() {
  const message = document.createElement("div");
  message.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff4444;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        font-size: 24px;
        z-index: 1000;
        animation: fadeOut 10s forwards;
    `;
  message.textContent = "GAMBLE FAILED! COUNTER RESET!";
  document.body.appendChild(message);
  setTimeout(() => message.remove(), 10000);
}

async function handleClick() {
  clicks++;
  pendingClicks++;
  estimatedGlobalClicks++;
  updateLocalUI();

  // Check for reset chance on each click
  if (Math.floor(Math.random() * 100) === 0) {
    console.log("Reset triggered!");
    showResetMessage();
    estimatedGlobalClicks = 0;
    pendingClicks = 0;
    await updateServerClicks(true); // true indicates this is a reset
    return;
  } else if (pendingClicks >= BATCH_SIZE) {
    updateServerClicks(false);
  }
}

document.getElementById("body").onload = async () => {
  // Get initial global count
  try {
    const response = await fetch(`${ephemeralURL}/get-clicks`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      estimatedGlobalClicks = data.global_clicks;
      updateLocalUI();
    }
  } catch (error) {
    console.error("Error fetching initial global clicks:", error);
  }

  clicks = window.localStorage.getItem("clicks") || 0;
  updateLocalUI();
  await updateServerClicks(false);
};

document.getElementById("click").addEventListener("click", handleClick);

// Send any pending clicks when the user leaves the page
window.addEventListener("beforeunload", async (event) => {
  if (pendingClicks > 0) {
    event.preventDefault();

    try {
      const response = await fetch(`${ephemeralURL}/update-clicks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clicks: pendingClicks }),
        keepalive: true,
      });

      if (!response.ok) {
        console.error("Failed to send pending clicks before unload");
      }
    } catch (error) {
      console.error("Error sending pending clicks before unload:", error);
    }
  }
});

function updateLocalUI() {
  window.localStorage.setItem("clicks", clicks);
  document.getElementById(
    "amt-clicked"
  ).innerHTML = `You've clicked the button ${clicks} times.`;
  document.getElementById(
    "global-clicks"
  ).innerHTML = `Global Clicks: ${estimatedGlobalClicks}`;
}

async function updateServerClicks(isReset) {
  if (isUpdating) return;

  isUpdating = true;
  const clicksToSend = isReset ? 0 : pendingClicks;
  pendingClicks = 0;

  try {
    console.log("Sending to server:", { isReset, clicksToSend });
    const response = await fetch(`${ephemeralURL}/update-clicks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clicks: clicksToSend, isReset: isReset }),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    console.log("Server response:", data);
    estimatedGlobalClicks = data.global_clicks;
    updateLocalUI();
  } catch (error) {
    console.error("Error updating clicks:", error);
    if (!isReset) {
      pendingClicks += clicksToSend;
      estimatedGlobalClicks -= clicksToSend;
    }
  } finally {
    isUpdating = false;
  }
}

let backoffDelay = 5000;  // Start with 5 seconds
let maxDelay = 30000;     // Max delay of 30 seconds
let failureCount = 0;

const pollServer = async () => {
    try {
        const response = await fetch(`${ephemeralURL}/get-clicks`, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        });

        if (response.ok) {
            const data = await response.json();
            estimatedGlobalClicks = data.global_clicks;
            updateLocalUI();
            // Reset backoff on success
            backoffDelay = 5000;
            failureCount = 0;
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error("Polling error:", error.message);
        failureCount++;
        // Exponential backoff with max delay
        backoffDelay = Math.min(backoffDelay * 1.5, maxDelay);
    } finally {
        setTimeout(pollServer, backoffDelay);
    }
};

pollServer();
