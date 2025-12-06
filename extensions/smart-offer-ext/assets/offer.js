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
        botWelcomeMsg: "Bonjour ! 👋 Je peux vous faire une remise si vous me proposez un prix raisonnable. Quel est votre prix ?",
        widgetColor: "#000000"
    };

    // Fetch Custom Config
    (async () => {
        try {
            const res = await fetch(`/apps/negotiate?shop=${window.smartOfferConfig.shopUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.botWelcomeMsg) appSettings.botWelcomeMsg = data.botWelcomeMsg;
                if (data.widgetColor) appSettings.widgetColor = data.widgetColor;

                // Apply Styles
                btn.style.setProperty("background-color", appSettings.widgetColor, "important");
                btn.style.border = "none"; // Remove border if conflict

                const header = document.querySelector(".smart-offer-header");
                if (header) header.style.backgroundColor = appSettings.widgetColor;

                const submit = document.getElementById("smart-offer-submit");
                if (submit) submit.style.backgroundColor = appSettings.widgetColor;
            }
        } catch (e) {
            console.warn("SmartOffer: Could not load config", e);
        }
    })();

    // Chat State
    let isThinking = false;
    let attemptCount = 0;

    // ... (Helpers: Scroll, AddMessage, AddLoading, RemoveLoading) ...
    // Note: I need to preserve helpers, but 'Instruction' replaces block. 
    // I will use START/END lines carefully to insert after 'if (!btn) return;' and before 'btn.onclick'.

    // Actually, I'll modify the btn.onclick block to use appSettings instead of hardcoded string.

    // Open/Close
    btn.onclick = function () {
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
                card.style.marginBottom = "10px";
                card.style.background = "#f9f9f9";
                card.style.borderRadius = "8px";
                card.style.border = "1px solid #ddd";

                const img = document.createElement("img");
                img.src = config.productImage;
                img.style.width = "50px";
                img.style.height = "50px";
                img.style.objectFit = "cover";
                img.style.borderRadius = "4px";
                img.style.marginRight = "10px";

                const info = document.createElement("div");
                info.style.display = "flex";
                info.style.flexDirection = "column";

                const title = document.createElement("span");
                title.innerText = config.productTitle;
                title.style.fontWeight = "bold";
                title.style.fontSize = "0.9em";

                const price = document.createElement("span");
                price.innerText = config.productPrice;
                price.style.fontSize = "0.85em";
                price.style.color = "#555";

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

        const price = input.value;
        if (!price) return;

        attemptCount++; // Increment attempt

        // User Message
        addMessage(`${price} €`, "user");
        input.value = "";

        isThinking = true;
        submitBtn.disabled = true;
        addLoading();

        try {
            const response = await fetch('/apps/negotiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: window.smartOfferConfig.productId,
                    offerPrice: price,
                    shopUrl: window.smartOfferConfig.shopUrl,
                    round: attemptCount
                })
            });

            const data = await response.json();
            removeLoading();

            if (response.ok) {
                if (data.status === 'ACCEPTED') {
                    addMessage(data.message || `C'est d'accord pour <b>${price}€</b> ! 🎉`, "bot", true);

                    // Button to add to cart
                    const actionBtn = document.createElement("button");
                    actionBtn.className = "smart-offer-action-btn";
                    actionBtn.innerText = "Validation de la remise...";
                    actionBtn.disabled = true;
                    actionBtn.style.opacity = "0.7";
                    actionBtn.style.cursor = "not-allowed";

                    // Logic to add to cart and redirect
                    actionBtn.onclick = () => {
                        actionBtn.innerText = "Redirection...";
                        actionBtn.disabled = true;

                        const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
                        fetch(root + 'cart/add.js', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                items: [{
                                    id: window.smartOfferConfig.variantId,
                                    quantity: 1
                                }]
                            })
                        })
                            .then(res => {
                                if (res.ok) {
                                    window.location.href = root + `checkout?discount=${data.code}`;
                                } else {
                                    actionBtn.innerText = "Erreur (Réessayer)";
                                    actionBtn.disabled = false;
                                }
                            })
                            .catch(e => {
                                console.error(e);
                                actionBtn.innerText = "Erreur";
                            });
                    };

                    // Add button as a specialized message bubble
                    const btnContainer = document.createElement("div");
                    btnContainer.classList.add("smart-offer-message", "bot");
                    btnContainer.style.background = "transparent";
                    btnContainer.style.padding = "0";
                    btnContainer.appendChild(actionBtn);
                    messagesContainer.appendChild(btnContainer);
                    scrollToBottom();

                    // Enable after 2.5s to allow Shopify propagation
                    setTimeout(() => {
                        let timeLeft = 120; // 2 minutes

                        const updateTimer = () => {
                            const minutes = Math.floor(timeLeft / 60);
                            const seconds = timeLeft % 60;
                            const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
                            actionBtn.innerText = `Acheter à ${price}€ (Expire dans ${timeString})`;
                        };

                        actionBtn.disabled = false;
                        actionBtn.style.opacity = "1";
                        actionBtn.style.cursor = "pointer";
                        updateTimer();

                        const timerInterval = setInterval(() => {
                            timeLeft--;
                            if (timeLeft <= 0) {
                                clearInterval(timerInterval);
                                actionBtn.innerText = "Offre expirée";
                                actionBtn.disabled = true;
                                actionBtn.style.opacity = "0.7";
                                actionBtn.style.cursor = "not-allowed";
                                actionBtn.onclick = null; // Remove click handler
                            } else {
                                updateTimer();
                            }
                        }, 1000);

                    }, 2500);

                    // Disable further input
                    input.disabled = true;
                    submitBtn.style.display = 'none';

                } else if (data.status === 'REJECTED' || data.status === 'COUNTER') {
                    // The backend returns a specific message or we construct one
                    // data.message from backend: "Un peu juste... "
                    addMessage(data.message || `Hmm, c'est trop bas. Je peux descendre à ${data.counterPrice}€, pas moins.`, "bot");

                    if (data.counterPrice) {
                        const acceptBtn = document.createElement("button");
                        acceptBtn.className = "smart-offer-action-btn";
                        acceptBtn.innerText = `Accepter à ${data.counterPrice} €`;
                        acceptBtn.style.marginTop = "5px";
                        acceptBtn.style.fontSize = "0.9em";

                        acceptBtn.onclick = () => {
                            input.value = data.counterPrice;
                            handleSubmit();
                            acceptBtn.remove(); // Remove button after clicking to prevent double submit
                        };

                        const btnContainer = document.createElement("div");
                        btnContainer.classList.add("smart-offer-message", "bot");
                        btnContainer.style.background = "transparent";
                        btnContainer.style.padding = "0";
                        btnContainer.appendChild(acceptBtn);
                        messagesContainer.appendChild(btnContainer);
                        scrollToBottom();
                    }

                } else {
                    addMessage("Une erreur s'est produite. Essayez encore.", "bot");
                }
            } else {
                addMessage("Erreur de connexion. Réessayez plus tard.", "bot");
            }

        } catch (e) {
            console.error(e);
            removeLoading();
            addMessage("Echec de l'envoi du message.", "bot");
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

});
