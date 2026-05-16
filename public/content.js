document.addEventListener("submit", (e) => {
  const form = e.target;
  if (form && form.tagName === "FORM") {
    handleFormSubmit(form);
  }
}, true); // Use capture phase

function showSavePromptWidget(username, password) {
  // Remove any existing
  const existing = document.getElementById("phantom-save-prompt");
  if (existing) existing.remove();

  const widget = document.createElement("div");
  widget.id = "phantom-save-prompt";
  widget.style.position = "fixed";
  widget.style.top = "20px";
  widget.style.right = "20px";
  widget.style.backgroundColor = "#18181b"; // zinc-900
  widget.style.border = "1px solid #27272a"; // zinc-800
  widget.style.borderRadius = "8px";
  widget.style.padding = "16px";
  widget.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.5)";
  widget.style.zIndex = "2147483647";
  widget.style.fontFamily = "system-ui, -apple-system, sans-serif";
  widget.style.color = "white";
  widget.style.display = "flex";
  widget.style.flexDirection = "column";
  widget.style.gap = "12px";
  widget.style.width = "300px";

  const title = document.createElement("div");
  title.textContent = "Save Password?";
  title.style.fontWeight = "600";
  title.style.fontSize = "16px";

  const desc = document.createElement("div");
  desc.textContent = `Do you want to save the password for ${username || 'this account'} on ${window.location.hostname}?`;
  desc.style.fontSize = "14px";
  desc.style.color = "#a1a1aa";
  desc.style.lineHeight = "1.4";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.justifyContent = "flex-end";
  actions.style.marginTop = "4px";

  const btnNo = document.createElement("button");
  btnNo.textContent = "No";
  btnNo.style.padding = "6px 12px";
  btnNo.style.borderRadius = "6px";
  btnNo.style.border = "none";
  btnNo.style.backgroundColor = "transparent";
  btnNo.style.color = "#a1a1aa";
  btnNo.style.cursor = "pointer";
  btnNo.style.fontSize = "14px";
  btnNo.style.fontWeight = "500";
  btnNo.onmouseover = () => btnNo.style.backgroundColor = "#27272a";
  btnNo.onmouseout = () => btnNo.style.backgroundColor = "transparent";
  btnNo.onclick = () => widget.remove();

  const btnYes = document.createElement("button");
  btnYes.textContent = "Save";
  btnYes.style.padding = "6px 12px";
  btnYes.style.borderRadius = "6px";
  btnYes.style.border = "none";
  btnYes.style.backgroundColor = "white";
  btnYes.style.color = "black";
  btnYes.style.cursor = "pointer";
  btnYes.style.fontSize = "14px";
  btnYes.style.fontWeight = "500";
  btnYes.onmouseover = () => btnYes.style.backgroundColor = "#e4e4e7";
  btnYes.onmouseout = () => btnYes.style.backgroundColor = "white";
  btnYes.onclick = () => {
    try {
      chrome.storage.local.set({
        phantom_pending_credential: {
          username: username.trim(),
          password: password,
          url: window.location.hostname,
          timestamp: Date.now()
        }
      });
      chrome.runtime.sendMessage({ type: "PROMPT_SAVE_PASSWORD" });
    } catch (err) {
      console.log("Phantom Vault: Could not send message.");
    }
    widget.remove();
  };

  actions.appendChild(btnNo);
  actions.appendChild(btnYes);

  widget.appendChild(title);
  widget.appendChild(desc);
  widget.appendChild(actions);

  document.body.appendChild(widget);

  // Auto dismiss after 10 seconds
  setTimeout(() => {
    if (document.body.contains(widget)) {
      widget.remove();
    }
  }, 10000);
}

async function handleFormSubmit(form) {
  const passwordInput = form.querySelector('input[type="password"]');
  if (!passwordInput || !passwordInput.value) return;

  // Find username field
  let usernameInput = form.querySelector('input[type="email"], input[name*="user" i], input[name*="email" i], input[id*="user" i], input[id*="email" i], input[type="text"]');
  
  const password = passwordInput.value;
  const username = usernameInput ? usernameInput.value : "";

  if (password) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CHECK_CREDENTIAL_EXISTS",
        domain: window.location.hostname,
        username: username,
        password: password
      });
      // If the credential exists exactly, do not prompt
      if (response && response.exists) {
        return;
      }
    } catch (err) {
      console.log("Phantom Vault: Error checking credential existence", err);
    }
    
    showSavePromptWidget(username, password);
  }
}

// --- Autofill Widget Logic ---

let activeWidget = null;
let activeDropdown = null;

function isTargetInput(el) {
  if (!el || el.tagName !== "INPUT") return false;
  const type = el.type.toLowerCase();
  const name = (el.name || "").toLowerCase();
  const id = (el.id || "").toLowerCase();
  
  if (type === "password" || type === "email") return true;
  if (type === "text" && (name.includes("user") || name.includes("email") || name.includes("login") || id.includes("user") || id.includes("email") || id.includes("login"))) {
    return true;
  }
  return false;
}

function removeWidget() {
  if (activeWidget) {
    activeWidget.remove();
    activeWidget = null;
  }
  removeDropdown();
}

function removeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

function injectValue(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function handleAutofill(credential, currentInput) {
  // Find the form
  const form = currentInput.form;
  let usernameInput, passwordInput;

  if (form) {
    passwordInput = form.querySelector('input[type="password"]');
    usernameInput = form.querySelector('input[type="email"], input[name*="user" i], input[name*="email" i], input[id*="user" i], input[id*="email" i], input[type="text"]');
  } else {
    // Fallback: look at nearby inputs if no form
    if (currentInput.type === "password") {
      passwordInput = currentInput;
      // Find previous input that looks like a username
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
      const index = inputs.indexOf(currentInput);
      if (index > 0) usernameInput = inputs[index - 1];
    } else {
      usernameInput = currentInput;
      // Find next input that is a password
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
      const index = inputs.indexOf(currentInput);
      if (index !== -1 && index + 1 < inputs.length && inputs[index + 1].type === "password") {
        passwordInput = inputs[index + 1];
      }
    }
  }

  if (usernameInput && credential.username) injectValue(usernameInput, credential.username);
  if (passwordInput && credential.password) injectValue(passwordInput, credential.password);
  
  removeWidget();
}

function showDropdown(credentials, inputField, widgetRect) {
  removeDropdown();
  
  const dropdown = document.createElement("div");
  dropdown.style.position = "absolute";
  dropdown.style.top = `${widgetRect.bottom + 5}px`;
  dropdown.style.left = `${widgetRect.left}px`;
  dropdown.style.backgroundColor = "#18181b"; // zinc-900
  dropdown.style.border = "1px solid #27272a"; // zinc-800
  dropdown.style.borderRadius = "8px";
  dropdown.style.padding = "4px";
  dropdown.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.5)";
  dropdown.style.zIndex = "2147483647";
  dropdown.style.fontFamily = "system-ui, -apple-system, sans-serif";
  dropdown.style.minWidth = "200px";
  dropdown.style.color = "white";

  if (credentials.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No saved passwords";
    empty.style.padding = "8px 12px";
    empty.style.fontSize = "13px";
    empty.style.color = "#a1a1aa"; // zinc-400
    dropdown.appendChild(empty);
  } else {
    credentials.forEach(cred => {
      const item = document.createElement("div");
      item.style.padding = "8px 12px";
      item.style.cursor = "pointer";
      item.style.borderRadius = "4px";
      item.style.display = "flex";
      item.style.flexDirection = "column";
      item.style.gap = "2px";
      
      item.onmouseover = () => item.style.backgroundColor = "#27272a";
      item.onmouseout = () => item.style.backgroundColor = "transparent";
      
      const title = document.createElement("span");
      title.textContent = cred.title || "Unknown";
      title.style.fontSize = "14px";
      title.style.fontWeight = "500";
      
      const username = document.createElement("span");
      username.textContent = cred.username || "";
      username.style.fontSize = "12px";
      username.style.color = "#a1a1aa";
      
      item.appendChild(title);
      if (cred.username) item.appendChild(username);
      
      item.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleAutofill(cred, inputField);
      };
      
      dropdown.appendChild(item);
    });
  }

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;
}

function createWidget(inputField) {
  removeWidget();
  
  const rect = inputField.getBoundingClientRect();
  const widget = document.createElement("div");
  
  // Phantom Logo SVG
  widget.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  
  widget.style.position = "absolute";
  // Position inside the right edge of the input
  widget.style.top = `${window.scrollY + rect.top + (rect.height / 2) - 12}px`;
  widget.style.left = `${window.scrollX + rect.right - 32}px`;
  widget.style.width = "24px";
  widget.style.height = "24px";
  widget.style.backgroundColor = "black";
  widget.style.color = "white";
  widget.style.borderRadius = "4px";
  widget.style.display = "flex";
  widget.style.alignItems = "center";
  widget.style.justifyContent = "center";
  widget.style.cursor = "pointer";
  widget.style.zIndex = "2147483646";
  widget.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
  widget.title = "Autofill with Phantom Vault";

  widget.onmousedown = (e) => {
    // Prevent focus loss on input
    e.preventDefault();
  };

  widget.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Add loading state
    widget.style.opacity = "0.5";
    
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: "REQUEST_CREDENTIALS",
        domain: window.location.hostname
      });
      
      widget.style.opacity = "1";
      
      if (!response) {
        throw new Error("No response");
      }
      
      if (response.locked) {
        // Vault is locked, prompt to open
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
        alert("Phantom Vault is locked. Please open the side panel to unlock it, then try again.");
      } else if (response.success && response.credentials) {
        if (response.credentials.length === 1) {
          // Auto-fill directly if only 1
          handleAutofill(response.credentials[0], inputField);
        } else {
          // Show dropdown for multiple passwords
          showDropdown(response.credentials, inputField, widget.getBoundingClientRect());
        }
      }
    } catch (err) {
      widget.style.opacity = "1";
      console.log("Phantom Vault Autofill Error:", err);
      // Maybe extension is suspended, try waking it up
      try {
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
      } catch(e) {}
    }
  };

  document.body.appendChild(widget);
  activeWidget = widget;
}

document.addEventListener("focusin", (e) => {
  if (isTargetInput(e.target)) {
    createWidget(e.target);
  }
});

// Hide widget and dropdown when clicking outside
document.addEventListener("mousedown", (e) => {
  if (activeWidget && !activeWidget.contains(e.target) && activeDropdown && !activeDropdown.contains(e.target)) {
    // Wait a bit to let other events fire
    setTimeout(() => {
      if (document.activeElement && isTargetInput(document.activeElement)) {
        // Don't remove if we just clicked into another valid input
        return;
      }
      removeWidget();
    }, 100);
  } else if (activeWidget && !activeWidget.contains(e.target) && !activeDropdown && document.activeElement !== e.target) {
     setTimeout(() => {
      if (document.activeElement && isTargetInput(document.activeElement)) return;
      removeWidget();
    }, 100);
  }
});

// Update widget position on scroll or resize
window.addEventListener("scroll", () => {
  if (activeWidget && document.activeElement && isTargetInput(document.activeElement)) {
    createWidget(document.activeElement);
    removeDropdown();
  } else {
    removeWidget();
  }
}, { passive: true });

window.addEventListener("resize", () => {
  if (activeWidget && document.activeElement && isTargetInput(document.activeElement)) {
    createWidget(document.activeElement);
    removeDropdown();
  } else {
    removeWidget();
  }
});

// --- Highlight Note Widget Logic ---

let highlightWidget = null;

document.addEventListener("mouseup", (e) => {
  // If clicking inside the widget, do nothing
  if (highlightWidget && highlightWidget.contains(e.target)) return;

  // Small delay to allow selection to form
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Don't show if the selection is inside input/textarea
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) return;

      showHighlightWidget(rect, text);
    } else {
      removeHighlightWidget();
    }
  }, 10);
});

document.addEventListener("mousedown", (e) => {
   if (highlightWidget && !highlightWidget.contains(e.target)) {
       removeHighlightWidget();
   }
});

function removeHighlightWidget() {
  if (highlightWidget) {
    highlightWidget.remove();
    highlightWidget = null;
  }
}

function showHighlightWidget(rect, text) {
  removeHighlightWidget();

  const widget = document.createElement("div");
  widget.style.position = "absolute";
  // Attempt to position above, fallback to below if not enough space
  const topPos = rect.top >= 40 ? rect.top - 40 : rect.bottom + 10;
  widget.style.top = `${window.scrollY + topPos}px`;
  widget.style.left = `${window.scrollX + rect.left + (rect.width / 2) - 45}px`;
  widget.style.backgroundColor = "black";
  widget.style.color = "white";
  widget.style.borderRadius = "6px";
  widget.style.padding = "6px 10px";
  widget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
  widget.style.zIndex = "2147483646";
  widget.style.display = "flex";
  widget.style.alignItems = "center";
  widget.style.gap = "6px";
  widget.style.cursor = "pointer";
  widget.style.fontFamily = "system-ui, -apple-system, sans-serif";
  widget.style.fontSize = "12px";
  widget.style.fontWeight = "500";
  
  // Pen/Note Icon
  widget.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
  <span>Save Note</span>`;

  widget.onmouseover = () => widget.style.backgroundColor = "#27272a";
  widget.onmouseout = () => widget.style.backgroundColor = "black";

  widget.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  widget.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      chrome.storage.local.set({
        phantom_pending_note: {
          text: text,
          url: window.location.href,
          timestamp: Date.now()
        }
      });
      chrome.runtime.sendMessage({ type: "PROMPT_SAVE_NOTE" });
    } catch (err) {
      console.log("Phantom Vault: Could not send message.");
    }
    removeHighlightWidget();
    window.getSelection().removeAllRanges();
  };

  document.body.appendChild(widget);
  highlightWidget = widget;
}
