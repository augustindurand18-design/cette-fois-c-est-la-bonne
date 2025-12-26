document.addEventListener('DOMContentLoaded', function () {
    // --- State Management ---
    const State = {
        messages: [],
        isThinking: false,
        isLoading: false,
        isOpen: false,
        sessionId: null,
        config: {},
        attemptCount: 0,
        pendingManualPrice: null
    };

    // --- DOM Elements ---
    const UI = {
        modal: document.getElementById("smart-offer-modal"),
        btn: document.getElementById("smart-offer-trigger"),
        closeBtn: document.querySelector(".smart-offer-close"),
        submitBtn: document.getElementById("smart-offer-submit"),
        input: document.getElementById("smart-offer-input"),
        messagesContainer: document.getElementById("smart-offer-messages"),
        chatContainer: document.querySelector('.smart-offer-chat-container')
    };

    if (!UI.btn) return;

    // Default App Settings
    let appSettings = {
        botWelcomeMsg: "Hello! 👋 I can offer you a discount if you propose a reasonable price. What is your price?",
        widgetColor: "#000000",
        widgetTitle: "Chat with us",
        botIcon: null
    };

    // --- Core Functions ---

    // 1. Initialize & Fetch Config
    const init = async () => {
        try {
            const config = window.smartOfferConfig;
            State.config = config;

            const queryParams = new URLSearchParams({
                shop: config.shopUrl,
                productId: config.productId,
                collectionIds: config.collectionIds || ""
            });

            const res = await fetch(`/apps/negotiate?${queryParams.toString()}`);
            if (res.ok) {
                const data = await res.json();

                // Update Settings
                if (data.botWelcomeMsg) appSettings.botWelcomeMsg = data.botWelcomeMsg;
                if (data.widgetColor) appSettings.widgetColor = data.widgetColor;
                if (data.widgetTitle) appSettings.widgetTitle = data.widgetTitle;
                if (data.botIcon) appSettings.botIcon = data.botIcon;

                // Apply Styles
                const header = document.querySelector(".smart-offer-header");
                // Only apply custom color if theme is NOT modern (modern uses glassmorphism)
                if (header && data.chatTheme !== 'modern') {
                    header.style.backgroundColor = appSettings.widgetColor;
                } else if (header && data.chatTheme === 'modern') {
                    // Ensure it's clear for modern
                    header.style.removeProperty('background-color');
                }

                // Branding / Watermark Logic
                const brandingEl = document.querySelector(".smart-offer-branding");
                if (brandingEl) {
                    if (data.showWatermark === false) {
                        brandingEl.style.display = 'none';
                    } else {
                        brandingEl.style.display = 'block'; // Ensure visible otherwise
                    }
                }

                const titleEl = document.querySelector(".smart-offer-title");
                if (titleEl) titleEl.innerText = appSettings.widgetTitle;

                if (UI.submitBtn && data.widgetColor) UI.submitBtn.style.backgroundColor = data.widgetColor;

                // Apply Widget Template
                if (UI.modal) {
                    const template = data.widgetTemplate || 'centered';
                    const theme = data.chatTheme || 'modern';

                    // Template Classes (Positioning)
                    UI.modal.classList.remove('template-classic', 'template-modern', 'template-popup', 'template-centered', 'template-corner');
                    UI.modal.classList.add(`template-${template}`);

                    // Theme Classes (Visuals) - Applied to Chat Container
                    if (UI.chatContainer) {
                        UI.chatContainer.classList.remove('theme-modern', 'theme-playful', 'theme-classic');
                        UI.chatContainer.classList.add(`theme-${theme}`);
                    }

                    // Sync State
                    if (State.config) {
                        State.config.widgetTemplate = template;
                        State.config.chatTheme = theme;
                    }
                }

                // Activation Logic
                if (data.isEligible && data.isActive) {
                    UI.btn.style.display = "flex";

                    // Exit Intent
                    if (data.enableExitIntent) setupExitIntent();

                    // Inactivity Trigger
                    if (data.enableInactivityTrigger) setupInactivityTrigger();
                } else {
                    // Explicitly ensure it's hidden and remove listeners if any
                    UI.btn.style.display = "none";
                }
            }
        } catch (e) {
            console.warn("SmartOffer: Init failed", e);
        }
    };

    const setupExitIntent = () => {
        const onMouseLeave = (e) => {
            if (e.clientY <= 0 && !State.isOpen) {
                openChat();
                document.removeEventListener("mouseleave", onMouseLeave);
            }
        };
        document.addEventListener("mouseleave", onMouseLeave);
    };

    const setupInactivityTrigger = () => {
        let inactivityTimer;
        const INACTIVITY_LIMIT = 20000; // 20 seconds

        const resetTimer = () => {
            if (State.isOpen) return; // Stop tracking if already open
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                if (!State.isOpen) {
                    openChat();
                    // Optional: remove listeners once triggered
                    cleanup();
                }
            }, INACTIVITY_LIMIT);
        };

        const cleanup = () => {
            document.removeEventListener("mousemove", resetTimer);
            document.removeEventListener("keydown", resetTimer);
            document.removeEventListener("scroll", resetTimer);
            document.removeEventListener("click", resetTimer);
            document.removeEventListener("touchstart", resetTimer);
        };

        // Listen for activity
        document.addEventListener("mousemove", resetTimer);
        document.addEventListener("keydown", resetTimer);
        document.addEventListener("scroll", resetTimer);
        document.addEventListener("click", resetTimer);
        document.addEventListener("touchstart", resetTimer);

        // Start initial timer
        resetTimer();
    };

    // 2. Chat Logic (Optimistic UI)
    const handleSendMessage = async () => {
        const text = UI.input.value.trim();
        if (!text || State.isThinking) return;

        // A. Optimistic Update (Immediate)
        addMessage(text, 'user');
        UI.input.value = "";
        State.attemptCount++;
        setThinking(true);

        // B. Prepare Payload
        // 1. Try to get Session ID from LocalStorage
        let storedSessionId = localStorage.getItem("smartOfferSessionId");
        if (!storedSessionId) {
            storedSessionId = generateUUID();
            localStorage.setItem("smartOfferSessionId", storedSessionId);
        }
        State.sessionId = storedSessionId;

        const payload = {
            productId: State.config.productId,
            shopUrl: State.config.shopUrl,
            round: State.attemptCount,
            sessionId: State.sessionId,
            offerPrice: State.pendingManualPrice ? State.pendingManualPrice : text,
            customerEmail: State.pendingManualPrice ? text : undefined, // If pending manual, text is email
            locale: (document.documentElement.lang || 'en').split('-')[0] // Send 'fr' or 'en'
        };

        // C. Network Request
        try {
            // Artificial delay for realism (min 800ms) to prevent flickering "too fast" responses
            const startTime = Date.now();

            const response = await fetch('/apps/negotiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            // Ensure minimum delay
            const elapsed = Date.now() - startTime;
            if (elapsed < 800) await wait(800 - elapsed);

            setThinking(false);

            if (response.ok) {
                handleServerResponse(data, payload);
            } else {
                addMessage("Connection error. Please try again.", "bot");
            }

        } catch (e) {
            console.error(e);
            setThinking(false);
            addMessage("Network error. Check your connection.", "bot");
        }
    };

    const handleServerResponse = (data, payload) => {
        switch (data.status) {
            case 'ACCEPTED':
                launchConfetti();
                addMessage(data.message || `Deal! ${payload.offerPrice}€ accepted.`, "bot", true);
                showActionBtn("Add to Cart & Pay", data);
                lockInput();
                break;

            case 'ACCEPTED_DRAFT':
                launchConfetti();
                addMessage(data.message || "Offer accepted! A draft order has been created.", "bot", true);
                // For VIP Draft, we do NOT show "Add to Cart". It's a manual invoice process.
                // Maybe show a "Close" button or "Check Email" hint.
                lockInput();
                // Optional: Show specific UI for VIP
                const btn = document.getElementById('so-action-btn');
                if (btn) {
                    btn.style.display = 'none'; // Ensure button is hidden
                }
                break;

            case 'REQUEST_EMAIL':
                State.pendingManualPrice = payload.offerPrice;
                addMessage(data.message, "bot");
                UI.input.placeholder = "Enter your email...";
                UI.input.type = "email";
                UI.input.focus();
                break;

            case 'MANUAL_COMPLETED':
                addMessage(data.message, "bot");
                lockInput();
                State.pendingManualPrice = null;
                break;

            case 'REJECTED':
            case 'COUNTER':
                triggerShake();
                addMessage(data.message || "Offer rejected.", "bot");
                if (data.counterPrice) {
                    showActionBtn(`Accept ${data.counterPrice} €`, data, 'accept_counter');
                }
                break;

            case 'CHAT':
            default:
                addMessage(data.message || "I didn't understand.", "bot");
                break;
        }
    };

    // 3. UI Helpers
    const addMessage = (text, sender, isHtml = false) => {
        const msgDiv = document.createElement("div");
        msgDiv.className = `smart-offer-message-container ${sender}`;

        if (sender === 'bot' && appSettings.botIcon) {
            const icon = document.createElement("img");
            icon.src = appSettings.botIcon;
            icon.className = "smart-offer-bot-icon";
            msgDiv.appendChild(icon);
        }

        const bubble = document.createElement("div");
        bubble.className = `smart-offer-message-bubble ${sender}`;
        if (isHtml) bubble.innerHTML = text;
        else bubble.innerText = text;

        msgDiv.appendChild(bubble);
        UI.messagesContainer.appendChild(msgDiv);
        scrollToBottom();
    };

    const setThinking = (isThinking) => {
        State.isThinking = isThinking;
        UI.submitBtn.disabled = isThinking;
        UI.input.disabled = isThinking; // Optional: prevent spam

        if (isThinking) {
            // Add Loading Indicator
            const loader = document.createElement("div");
            loader.id = "smart-offer-loader";
            loader.className = "smart-offer-message-container bot";

            if (appSettings.botIcon) {
                const icon = document.createElement("img");
                icon.src = appSettings.botIcon;
                icon.className = "smart-offer-bot-icon";
                loader.appendChild(icon);
            }

            const bubble = document.createElement("div");
            bubble.className = "smart-offer-typing";
            bubble.innerHTML = "<span></span><span></span><span></span>";
            loader.appendChild(bubble);

            UI.messagesContainer.appendChild(loader);
        } else {
            // Remove Loading Indicator
            const loader = document.getElementById("smart-offer-loader");
            if (loader) loader.remove();
            UI.input.disabled = false;
            UI.input.focus();
        }
        scrollToBottom();
    };

    const scrollToBottom = () => {
        // Force scroll with robust fallback for mobile browsers
        requestAnimationFrame(() => {
            UI.messagesContainer.scrollTop = UI.messagesContainer.scrollHeight;
        });
    };

    const showActionBtn = (text, data, type = 'main') => {
        const container = document.createElement("div");
        container.className = "smart-offer-message-container bot";

        // Ghost bubble for alignment
        const bubble = document.createElement("div");
        bubble.className = "smart-offer-message-bubble bot";
        bubble.style.background = "transparent";
        bubble.style.boxShadow = "none";
        bubble.style.padding = "0";

        const btn = document.createElement("button");
        btn.className = "smart-offer-action-btn";
        btn.innerText = text;

        if (type === 'accept_counter') {
            btn.style.marginTop = "8px";
            btn.onclick = () => {
                UI.input.value = data.counterPrice;
                handleSendMessage(); // Re-trigger logic with counter price
                btn.remove();
            };
        } else {
            // Checkout Logic
            setupCheckoutButton(btn, data);
        }

        bubble.appendChild(btn);
        container.appendChild(bubble);
        UI.messagesContainer.appendChild(container);
        scrollToBottom();
    };

    const setupCheckoutButton = (btn, data) => {
        const originalText = btn.innerText;
        let timeLeft = (data.validityDuration || 5) * 60;

        // Add to Cart Logic
        btn.onclick = async () => {
            btn.innerText = "Processing...";
            btn.disabled = true;
            btn.style.opacity = "0.7";

            try {
                const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
                const res = await fetch(root + 'cart/add.js', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        items: [{ id: State.config.variantId, quantity: 1, properties: { '_SmartOffer': 'Accepted' } }]
                    })
                });

                if (res.ok) {
                    btn.innerText = "Redirecting...";
                    window.location.href = `${root}discount/${data.code}?redirect=${root}checkout`;
                } else {
                    throw new Error("Cart failed");
                }
            } catch (e) {
                console.error(e);
                btn.innerText = "Error. Retry?";
                btn.disabled = false;
                btn.style.opacity = "1";
            }
        };

        // Timer
        const interval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(interval);
                btn.innerText = "Offer Expired";
                btn.disabled = true;
            } else {
                const m = Math.floor(timeLeft / 60);
                const s = timeLeft % 60;
                if (!btn.disabled) btn.innerText = `${originalText} (${m}:${s < 10 ? '0' : ''}${s})`;
            }
        }, 1000);
    };

    const lockInput = () => {
        UI.input.disabled = true;
        UI.submitBtn.style.display = 'none';
    };

    const triggerShake = () => {
        UI.chatContainer.classList.remove('smart-offer-shake');
        void UI.chatContainer.offsetWidth; // Force reflow
        UI.chatContainer.classList.add('smart-offer-shake');
    };

    // 4. Modal Management & Rendering
    const openChat = async () => {
        UI.modal.style.display = "block";
        State.isOpen = true;
        document.body.style.overflow = "hidden"; // Mobile Scroll Lock

        // Initial Layout Render (Only if empty)
        if (UI.messagesContainer && UI.messagesContainer.children.length === 0) {
            const template = State.config.widgetTemplate || 'centered';

            // Always render standard chat layout
            await renderChatLayout();

            // Apply positioning class logic
            // Reset classes first
            UI.modal.classList.remove('template-centered', 'template-corner', 'template-modern', 'template-classic', 'template-popup');

            if (template === 'corner') {
                UI.modal.classList.add('template-corner');
            } else {
                // Default to centered for any other value (fallback)
                UI.modal.classList.add('template-centered');
            }
        }

        handleVisualViewport();
    };

    const renderChatLayout = async () => {
        // Standard Chatbot Flow
        renderProductCard();
        setThinking(true);
        await wait(600);
        setThinking(false);
        addMessage(appSettings.botWelcomeMsg, "bot");
    };

    // Removed Form Mode Logic (renderFormLayout, handleFormSubmission) as we are consolidating to Chat Interface only.

    const closeChat = () => {
        UI.modal.style.display = "none";
        State.isOpen = false;
        document.body.style.overflow = "";
    };

    const renderProductCard = () => {
        const { productImage, productTitle, productPrice } = State.config;
        if (!productImage) return;

        const card = document.createElement("div");
        card.innerHTML = `
            <div class="smart-offer-product-card" style="display:flex; align-items:center; padding:10px; margin-bottom:16px; background:#fff; border-radius:12px; border:1px solid #f2f2f7; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <img src="${productImage}" style="width:48px; height:48px; object-fit:cover; border-radius:8px; margin-right:12px;" />
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600; font-size:0.95em; color:#1c1c1e;">${productTitle}</span>
                    <span style="font-size:0.9em; color:#8e8e93;">${productPrice}</span>
                </div>
            </div>
        `;
        // Centering wrapper
        const wrapper = document.createElement("div");
        wrapper.style.display = "flex"; wrapper.style.justifyContent = "center"; wrapper.style.width = "100%";
        wrapper.appendChild(card.firstElementChild);
        UI.messagesContainer.appendChild(wrapper);
    };

    // 5. Mobile & Viewport Handling
    const handleVisualViewport = () => {
        if (!window.visualViewport || window.innerWidth > 480) return;

        const onResize = () => {
            if (!State.isOpen) return;
            const vv = window.visualViewport;
            const style = UI.chatContainer.style;

            // Sync with viewport
            style.height = `${vv.height}px`;
            style.top = `${vv.offsetTop}px`;

            // Adjust padding for keyboard
            if (vv.height < window.innerHeight * 0.85) {
                UI.chatContainer.classList.add('keyboard-open');
            } else {
                UI.chatContainer.classList.remove('keyboard-open');
            }
            scrollToBottom();
        };

        window.visualViewport.addEventListener('resize', onResize);
        window.visualViewport.addEventListener('scroll', onResize);
        onResize(); // Initial call
    };

    // --- Event Listeners ---
    UI.btn.onclick = openChat;
    UI.closeBtn.onclick = closeChat;
    window.addEventListener('click', (e) => { if (e.target === UI.modal) closeChat(); });

    UI.submitBtn.onclick = handleSendMessage;
    UI.input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Mobile Focus Hack to scroll
    UI.input.addEventListener('focus', () => setTimeout(scrollToBottom, 300));

    // Utils
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    // Confetti (Minified for brevity, same logic)
    function launchConfetti() {
        const c = document.querySelector('.smart-offer-chat-container'); if (!c) return;
        const cvs = document.createElement('canvas');
        cvs.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;border-radius:20px;";
        c.appendChild(cvs);
        const ctx = cvs.getContext('2d');
        cvs.width = c.offsetWidth; cvs.height = c.offsetHeight;
        const particles = Array.from({ length: 100 }, () => ({
            x: cvs.width / 2, y: cvs.height * 0.8, vx: (Math.random() - 0.5) * 15, vy: (Math.random() * -12) - 5,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`, size: Math.random() * 5 + 2
        }));
        function loop() {
            ctx.clearRect(0, 0, cvs.width, cvs.height);
            let active = false;
            particles.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.vx *= 0.95; p.vy *= 0.95;
                if (p.y < cvs.height + 20) { active = true; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
            });
            if (active) requestAnimationFrame(loop); else cvs.remove();
        }
        loop();
    }

    // Start
    init();
});
