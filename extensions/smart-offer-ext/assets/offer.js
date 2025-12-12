document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById("smart-offer-modal");
    const btn = document.getElementById("smart-offer-trigger");
    const closeBtn = document.querySelector(".smart-offer-close");
    const submitBtn = document.getElementById("smart-offer-submit");
    const input = document.getElementById("smart-offer-input");
    const messagesContainer = document.getElementById("smart-offer-messages");

    if (!btn) return;

    // Default Config
    let appSettings = {
        botWelcomeMsg: "Hello! 👋 I can offer you a discount if you propose a reasonable price. What is your price?",
        widgetColor: "#000000"
    };

    // Helper: Delay function
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Fetch Custom Config
    (async () => {
        try {
            const config = window.smartOfferConfig;
            const queryParams = new URLSearchParams({
                shop: config.shopUrl,
                productId: config.productId,
                collectionIds: config.collectionIds || ""
            });

            const res = await fetch(`/apps/negotiate?${queryParams.toString()}`);
            if (res.ok) {
                const data = await res.json();
                if (data.botWelcomeMsg) appSettings.botWelcomeMsg = data.botWelcomeMsg;
                if (data.widgetColor) appSettings.widgetColor = data.widgetColor;
                if (data.botIcon) appSettings.botIcon = data.botIcon;

                // Apply Styles
                const header = document.querySelector(".smart-offer-header");
                if (header) header.style.backgroundColor = appSettings.widgetColor;

                if (submitBtn && data.widgetColor) {
                    submitBtn.style.backgroundColor = data.widgetColor;
                }

                if (data.isEligible && data.isActive) {
                    btn.style.display = "flex";

                    // Exit Intent Trigger
                    if (data.enableExitIntent) {
                        const onMouseLeave = (e) => {
                            if (e.clientY <= 0) { // Mouse leaves top of viewport
                                if (modal.style.display !== "block") {
                                    btn.click(); // Simulate click to open
                                }
                                document.removeEventListener("mouseleave", onMouseLeave);
                            }
                        };
                        document.addEventListener("mouseleave", onMouseLeave);
                    }
                }
            }
        } catch (e) {
            console.warn("SmartOffer: Could not load config", e);
        }
    })();

    // Chat State
    let isThinking = false;
    let attemptCount = 0;
    let pendingManualPrice = null; // Store price when waiting for email

    const scrollToBottom = () => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const addMessage = (text, sender, isHtml = false) => {
        // Container (Flex row)
        const msgDiv = document.createElement("div");
        msgDiv.classList.add("smart-offer-message-container", sender);

        // Icon (Bot only)
        if (sender === "bot" && appSettings.botIcon) {
            const iconImg = document.createElement("img");
            iconImg.src = appSettings.botIcon;
            iconImg.classList.add("smart-offer-bot-icon");
            msgDiv.appendChild(iconImg);
        }

        // Bubble (The actual text part)
        const bubble = document.createElement("div");
        bubble.classList.add("smart-offer-message-bubble", sender);

        if (isHtml) bubble.innerHTML = text;
        else bubble.innerText = text;

        msgDiv.appendChild(bubble);

        messagesContainer.appendChild(msgDiv);
        scrollToBottom();
    };

    const addLoading = () => {
        const loaderContainer = document.createElement("div");
        loaderContainer.className = "smart-offer-message-container bot";
        loaderContainer.id = "smart-offer-loading-indicator";

        if (appSettings.botIcon) {
            const iconImg = document.createElement("img");
            iconImg.src = appSettings.botIcon;
            iconImg.classList.add("smart-offer-bot-icon");
            loaderContainer.appendChild(iconImg);
        }

        const bubble = document.createElement("div");
        // Using special class for typing indicator styling
        bubble.className = "smart-offer-typing";
        bubble.innerHTML = "<span></span><span></span><span></span>";

        loaderContainer.appendChild(bubble);
        messagesContainer.appendChild(loaderContainer);
        scrollToBottom();
    };

    const removeLoading = () => {
        const loader = document.getElementById("smart-offer-loading-indicator");
        if (loader) loader.remove();
    };

    // Open/Close
    btn.onclick = async function () {
        modal.style.display = "block";
        if (messagesContainer.children.length === 0) {
            // Add Product Preview
            const config = window.smartOfferConfig;
            if (config.productImage && config.productTitle) {
                const card = document.createElement("div");
                card.className = "smart-offer-product-card";
                card.style.display = "flex";
                card.style.alignItems = "center";
                card.style.padding = "10px";
                card.style.marginBottom = "16px";
                card.style.background = "#fff";
                card.style.borderRadius = "12px";
                card.style.border = "1px solid #f2f2f7";
                card.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";

                const img = document.createElement("img");
                img.src = config.productImage;
                img.style.width = "48px";
                img.style.height = "48px";
                img.style.objectFit = "cover";
                img.style.borderRadius = "8px";
                img.style.marginRight = "12px";

                const info = document.createElement("div");
                info.style.display = "flex";
                info.style.flexDirection = "column";

                const title = document.createElement("span");
                title.innerText = config.productTitle;
                title.style.fontWeight = "600";
                title.style.fontSize = "0.95em";
                title.style.color = "#1c1c1e";

                const price = document.createElement("span");
                price.innerText = config.productPrice;
                price.style.fontSize = "0.9em";
                price.style.color = "#8e8e93";

                info.appendChild(title);
                info.appendChild(price);
                card.appendChild(img);
                card.appendChild(info);

                const cardContainer = document.createElement("div");
                cardContainer.style.width = "100%";
                cardContainer.style.display = "flex";
                cardContainer.style.justifyContent = "center";
                cardContainer.appendChild(card);

                messagesContainer.appendChild(cardContainer);
            }

            // Simulate typing for welcome message
            addLoading();
            await wait(600);
            removeLoading();
            addMessage(appSettings.botWelcomeMsg, "bot");
        }
    }

    closeBtn.onclick = function () {
        modal.style.display = "none";
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    // Submit Action
    const handleSubmit = async () => {
        if (isThinking) return;

        const inputValue = input.value;
        if (!inputValue) return;

        attemptCount++; // Increment attempt

        // User Message
        addMessage(inputValue, "user");
        input.value = "";

        isThinking = true;
        submitBtn.disabled = true;

        // Random "thinking" delay for realism (1s to 2s)
        const thinkingTime = 1000 + Math.random() * 1000;
        addLoading();

        // Generate or retrieve Session ID for Rate Limiting
        let sessionId = sessionStorage.getItem("smartOfferSessionId");
        if (!sessionId) {
            sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            sessionStorage.setItem("smartOfferSessionId", sessionId);
        }

        // Determine payload based on state
        let payload = {
            productId: window.smartOfferConfig.productId,
            shopUrl: window.smartOfferConfig.shopUrl,
            round: attemptCount,
            sessionId: sessionId
        };

        if (pendingManualPrice) {
            payload.offerPrice = pendingManualPrice;
            payload.customerEmail = inputValue;
        } else {
            payload.offerPrice = inputValue;
            // No email yet
        }

        try {
            const [response] = await Promise.all([
                fetch('/apps/negotiate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }),
                wait(thinkingTime) // Ensure we wait at least this long
            ]);

            const data = await response.json();
            removeLoading();

            if (response.ok) {
                if (data.status === 'ACCEPTED') {
                    // Trigger Confetti
                    launchConfetti();

                    addMessage(data.message || `It's a deal for <b>${payload.offerPrice}€</b> ! 🎉`, "bot", true);

                    // Refined Action Button
                    const actionBtn = document.createElement("button");
                    actionBtn.className = "smart-offer-action-btn";
                    actionBtn.innerText = "Add to Cart & Pay";

                    // Logic to add to cart and redirect
                    actionBtn.onclick = async () => {
                        actionBtn.innerText = "Adding...";
                        actionBtn.disabled = true;
                        actionBtn.style.opacity = "0.8";

                        const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";

                        try {
                            // 1. Add to Cart via AJAX
                            const addToCartRes = await fetch(root + 'cart/add.js', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    items: [{
                                        id: window.smartOfferConfig.variantId,
                                        quantity: 1,
                                        properties: {
                                            '_SmartOffer': 'Accepted' // Mark as negotiated item if needed later
                                        }
                                    }]
                                })
                            });

                            if (addToCartRes.ok) {
                                actionBtn.innerText = "Redirecting to checkout...";
                                // 2. Redirect to Checkout with Discount Code
                                window.location.href = `/discount/${data.code}?redirect=/checkout`;
                            } else {
                                throw new Error("Cart add failed");
                            }
                        } catch (e) {
                            console.error(e);
                            actionBtn.innerText = "Error - Retry";
                            actionBtn.disabled = false;
                            actionBtn.style.opacity = "1";
                        }
                    };

                    // Add button as a specialized message bubble
                    const btnContainer = document.createElement("div");
                    btnContainer.classList.add("smart-offer-message-container", "bot");

                    if (appSettings.botIcon) {
                        const iconImg = document.createElement("img");
                        iconImg.src = appSettings.botIcon;
                        iconImg.classList.add("smart-offer-bot-icon");
                        btnContainer.appendChild(iconImg);
                    }

                    const bubble = document.createElement("div");
                    bubble.classList.add("smart-offer-message-bubble", "bot");
                    bubble.style.background = "transparent";
                    bubble.style.padding = "0";
                    bubble.style.boxShadow = "none";
                    bubble.appendChild(actionBtn);

                    btnContainer.appendChild(bubble);
                    messagesContainer.appendChild(btnContainer);
                    scrollToBottom();

                    // Countdown logic
                    let timeLeft = 300; // 5 minutes to create urgency
                    const originalBtnText = "Add to Cart & Pay";

                    const updateTimer = () => {
                        const minutes = Math.floor(timeLeft / 60);
                        const seconds = timeLeft % 60;
                        const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
                        if (!actionBtn.disabled || actionBtn.innerText.includes("Add")) {
                            actionBtn.innerText = `${originalBtnText} (${timeString})`;
                        }
                    };
                    updateTimer();

                    const timerInterval = setInterval(() => {
                        timeLeft--;
                        if (timeLeft <= 0) {
                            clearInterval(timerInterval);
                            actionBtn.innerText = "Offer expired";
                            actionBtn.disabled = true;
                            actionBtn.onclick = null;
                        } else {
                            updateTimer();
                        }
                    }, 1000);


                    // Disable further input
                    input.disabled = true;
                    submitBtn.style.display = 'none';

                } else if (data.status === 'REQUEST_EMAIL') {
                    // Manual Mode: Bot asks for email
                    pendingManualPrice = payload.offerPrice;
                    addMessage(data.message, "bot");

                    input.placeholder = "name@example.com";
                    input.type = "email";
                    input.focus();

                } else if (data.status === 'MANUAL_COMPLETED') {
                    // Manual Mode: Finished
                    addMessage(data.message, "bot");

                    // Reset or Close
                    pendingManualPrice = null;
                    input.disabled = true;
                    submitBtn.style.display = 'none';

                } else if (data.status === 'REJECTED' || data.status === 'COUNTER') {
                    // Trigger Shake
                    const container = document.querySelector('.smart-offer-chat-container');
                    if (container) {
                        container.classList.remove('smart-offer-shake');
                        void container.offsetWidth; // trigger reflow
                        container.classList.add('smart-offer-shake');
                        setTimeout(() => container.classList.remove('smart-offer-shake'), 500);
                    }

                    addMessage(data.message || `Hmm, that's too low. I can go down to ${data.counterPrice}€, no less.`, "bot");

                    if (data.counterPrice) {
                        const acceptBtn = document.createElement("button");
                        acceptBtn.className = "smart-offer-action-btn";
                        acceptBtn.innerText = `Accept counter-offer (${data.counterPrice} €)`;
                        acceptBtn.style.marginTop = "8px";

                        acceptBtn.onclick = () => {
                            input.value = data.counterPrice;
                            handleSubmit();
                            acceptBtn.remove();
                        };

                        const btnContainer = document.createElement("div");
                        btnContainer.classList.add("smart-offer-message-container", "bot");
                        if (appSettings.botIcon) {
                            const iconImg = document.createElement("img");
                            iconImg.src = appSettings.botIcon;
                            iconImg.classList.add("smart-offer-bot-icon");
                            btnContainer.appendChild(iconImg);
                        }

                        const bubble = document.createElement("div");
                        bubble.classList.add("smart-offer-message-bubble", "bot");
                        bubble.style.background = "transparent";
                        bubble.style.padding = "0";
                        bubble.style.boxShadow = "none";
                        bubble.appendChild(acceptBtn);

                        btnContainer.appendChild(bubble);
                        messagesContainer.appendChild(btnContainer);
                        scrollToBottom();
                    }

                } else if (data.status === 'CHAT') {
                    addMessage(data.message, "bot");
                } else if (data.status === 'ERROR') {
                    addMessage(data.error || "An error occurred.", "bot");
                } else {
                    addMessage("An error occurred.", "bot");
                }

            } else {
                addMessage("Connection error.", "bot");
            }

        } catch (e) {
            console.error(e);
            removeLoading();
            addMessage("Failed to send message.", "bot");
        } finally {
            if (!input.disabled) {
                isThinking = false;
                submitBtn.disabled = false;
                input.focus();
            }
        }
    };

    submitBtn.onclick = handleSubmit;

    input.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
        }
    });

    // Mobile Keyboard Handling: Visual Viewport Binding
    if (window.visualViewport) {
        const handleVisualViewportResize = () => {
            // Only apply fix on mobile screens
            if (window.innerWidth <= 480) {
                const container = document.querySelector('.smart-offer-chat-container');
                if (container) {
                    // Force height to match the actual visible area
                    container.style.height = `${window.visualViewport.height}px`;

                    // CRITICAL: Sync top position to viewport offset to handle scroll
                    // This ensures the fixed container moves with the visual viewport
                    container.style.top = `${window.visualViewport.offsetTop}px`;

                    // Detect keyboard: if viewport height is significantly less than window innerHeight
                    if (window.visualViewport.height < window.innerHeight * 0.85) {
                        container.classList.add('keyboard-open');
                    } else {
                        container.classList.remove('keyboard-open');
                    }

                    setTimeout(scrollToBottom, 50);
                }
            } else {
                // Reset on desktop/larger screens
                const container = document.querySelector('.smart-offer-chat-container');
                if (container) {
                    container.style.height = '';
                    container.style.top = ''; // Reset top
                    container.classList.remove('keyboard-open');
                }
            }
        };

        window.visualViewport.addEventListener('resize', handleVisualViewportResize);
        window.visualViewport.addEventListener('scroll', handleVisualViewportResize);

        // Initial check
        handleVisualViewportResize();
    }

    input.addEventListener('focus', () => {
        // slight delay to ensure keyboard animation is factored in if viewport doesn't fire immediately
        setTimeout(scrollToBottom, 300);
    });

    // --- Simple Confetti Implementation ---
    function launchConfetti() {
        // Target the container
        const container = document.querySelector('.smart-offer-chat-container');
        if (!container) return;

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute'; // Absolute relative to container
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '10'; // Inside container, on top of messages
        canvas.style.borderRadius = '20px'; // Match container radius
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const width = container.offsetWidth;
        const height = container.offsetHeight;
        canvas.width = width;
        canvas.height = height;

        const particles = [];
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffa500'];

        for (let i = 0; i < 150; i++) {
            particles.push({
                x: width / 2, // Start from center width
                y: height * 0.8, // Start from lower part (near input)
                vx: (Math.random() - 0.5) * 15, // Explosion spread
                vy: (Math.random() * -12) - 5, // Upward force
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 5 + 3,
                gravity: 0.4,
                drag: 0.95
            });
        }

        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let active = false;

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                p.vx *= p.drag;
                p.vy *= p.drag;

                if (p.y < canvas.height + 20 && p.size > 0.1) {
                    active = true;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            if (active) {
                requestAnimationFrame(render);
            } else {
                canvas.remove();
            }
        }
        render();
    }

});
