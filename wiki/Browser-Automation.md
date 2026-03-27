# Browser Automation

Annotix includes a browser automation system based on Chrome DevTools Protocol (CDP) that can control the user's visible browser. It enables two main features: **free GPU training on Google Colab** and **LLM queries without API keys**.

## Architecture

The automation uses the `headless_chrome` Rust crate to connect to a Chromium-based browser via CDP. Despite the crate name, the browser runs **visible** (not headless), so the user can see what's happening and intervene if needed.

### Key Files

| File | Purpose |
|------|---------|
| `browser_detect.rs` | Discover installed browsers |
| `browser_session.rs` | Launch and manage browser sessions |
| `step_engine.rs` | Execute automation steps sequentially |
| `colab_free.rs` | Google Colab training automation |
| `llm_chat.rs` | LLM provider automation |
| `providers/` | Provider-specific configurations and selectors |

---

## Browser Detection

Annotix auto-detects installed Chromium-based browsers.

### Search Paths by OS

**Linux:**
- `/usr/bin/google-chrome-stable`
- `/usr/bin/brave-browser`
- `/usr/bin/chromium`
- Fallback: `which` command

**Windows:**
- `%ProgramFiles%/Google/Chrome/Application/chrome.exe`
- `%ProgramFiles%/BraveSoftware/Brave-Browser/Application/brave.exe`
- `%ProgramFiles(x86)%/Microsoft/Edge/Application/msedge.exe`
- `%LocalAppData%/Vivaldi/Application/vivaldi.exe`

**macOS:**
- `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`
- `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`

### Supported Browsers

Any Chromium-based browser: Chrome, Brave, Edge, Chromium, Vivaldi, etc.

---

## Browser Session

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| **Window Size** | 1280 x 900 | Browser window dimensions |
| **User Data Dir** | `~/.local/share/annotix/browser_automation/` | Persistent profile (cookies, logins) |
| **Idle Timeout** | 10 minutes | Auto-close on inactivity |
| **Headless** | No | Browser is always visible |

### Launch Flags

```
--no-first-run
--no-default-browser-check
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
--disable-renderer-backgrounding
```

### Session States

| State | Description |
|-------|-------------|
| `Idle` | Not started |
| `DetectingBrowser` | Finding installed browser |
| `LaunchingBrowser` | Opening browser process |
| `WaitingLogin` | User needs to sign in manually |
| `Running` | Executing automation steps |
| `Paused` | Temporarily halted |
| `Completed` | Finished successfully |
| `Failed` | Error occurred |
| `Cancelled` | User cancelled |

---

## Free Google Colab Training

Train ML models on Google Colab's free T4 GPU, automated entirely from Annotix.

### Prerequisites

- A Chromium-based browser installed.
- A Google account (for Colab access).

### Workflow (10 Steps)

| Step | Action | User Interaction |
|------|--------|:----------------:|
| 1 | Open Google Colab | Automatic |
| 2 | Login to Google | **Manual** (first time only) |
| 3 | Create new notebook | Automatic |
| 4 | Configure T4 GPU runtime | Automatic |
| 5 | Install dependencies (`pip install ultralytics`) | Automatic |
| 6 | Upload dataset ZIP | Automatic |
| 7 | Inject training code | Automatic |
| 8 | Run training cells | Automatic |
| 9 | Monitor progress | Automatic (polls every 10s) |
| 10 | Download trained model | Automatic |

### How It Works

1. Annotix launches the browser and navigates to Colab.
2. If not logged in, it pauses and waits for you to sign in (cookies are saved for next time).
3. Creates a new notebook and selects the T4 GPU runtime.
4. Installs required packages in a code cell.
5. Uploads the dataset using Colab's `files.upload()` API.
6. Writes and executes the training script.
7. Polls cell output every 10 seconds looking for `ANNOTIX_EVENT:` markers.
8. Parses metrics and emits progress events to the Annotix UI.
9. On completion, downloads the `best.pt` model file.

### Limitations

- **Max timeout:** 1 hour per session.
- **Colab limits:** Free tier has usage quotas (varies).
- **GPU availability:** T4 may not always be available.
- **CUDA errors and disconnections** are detected and reported.

---

## LLM Queries Without API Keys

Access language models through the user's browser, leveraging free web interfaces.

### Supported Providers

| Provider | URL | Model |
|----------|-----|-------|
| **Kimi** | kimi.moonshot.cn | Moonshot AI |
| **Qwen** | chat.qwen.ai | Alibaba Qwen |
| **DeepSeek** | chat.deepseek.com | DeepSeek |
| **HuggingChat** | huggingface.co/chat | Open-source models |

### Workflow (6 Steps)

| Step | Action | User Interaction |
|------|--------|:----------------:|
| 1 | Open provider URL | Automatic |
| 2 | Login | **Manual** (first time only) |
| 3 | Create new conversation | Automatic |
| 4 | Send prompt | Automatic |
| 5 | Wait for response | Automatic (max 2 minutes) |
| 6 | Extract response text | Automatic |

### How It Works

1. Browser navigates to the provider's chat URL.
2. If not logged in, pauses for user authentication (cookies saved).
3. Finds the chat input field using provider-specific CSS selectors.
4. Types the prompt and submits it.
5. Waits for the typing indicator to disappear (response complete).
6. Extracts the last message's text content from the DOM.

### Selector System

Each provider has its own CSS selector configuration:

```json
{
  "input_field": "textarea[data-testid='chat-input']",
  "send_button": "button[data-testid='send']",
  "message_container": "[class*='message']",
  "typing_indicator": "[class*='typing']"
}
```

Selectors include fallback options for when providers update their DOM structure.

### Response Timeout

- **Default:** 2 minutes (120 seconds).
- If no response is detected within the timeout, the step is marked as failed.

---

## Step Engine

All automation workflows use a common step engine that:

1. Receives a list of steps with actions and CSS selectors.
2. Executes each step sequentially.
3. Waits for elements to appear (with timeout).
4. Reports step status (pending, running, waiting_user, completed, failed, skipped).
5. Supports pause, resume, and cancel.

### Step States

| State | Description |
|-------|-------------|
| `Pending` | Not yet executed |
| `Running` | Currently executing |
| `WaitingUser` | Awaiting manual user action |
| `Completed` | Step finished successfully |
| `Failed` | Error in this step |
| `Skipped` | Step was skipped |

---

## Privacy Note

- All browser automation runs **locally** on the user's machine.
- No data is sent to Annotix servers.
- Login credentials are stored in the browser's profile, not by Annotix.
- The browser profile persists between sessions for convenience.
