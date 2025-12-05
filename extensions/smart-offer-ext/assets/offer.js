document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById("smart-offer-modal");
    const btn = document.getElementById("smart-offer-trigger");
    const span = document.getElementsByClassName("smart-offer-close")[0];
    const submitBtn = document.getElementById("smart-offer-submit");
    const input = document.getElementById("smart-offer-input");
    const feedback = document.getElementById("smart-offer-feedback");
    const step1 = document.getElementById("smart-offer-step-1");

    if (!btn) return;

    btn.onclick = function () {
        modal.style.display = "block";
    }

    span.onclick = function () {
        modal.style.display = "none";
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    submitBtn.onclick = async function () {
        const price = input.value;
        if (!price) return;

        submitBtn.innerText = "Le bot réfléchit...";
        submitBtn.disabled = true;
        feedback.innerHTML = "";

        try {
            const response = await fetch('/apps/negotiate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    productId: window.smartOfferConfig.productId,
                    offerPrice: price,
                    shopUrl: window.smartOfferConfig.shopUrl
                })
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                // Server returned HTML (crash) or other non-JSON
                const text = await response.text();
                console.error("Non-JSON Response:", text);
                feedback.innerHTML = `<p style='color:red;'>Erreur serveur (${response.status}). Voir console.</p>`;
                submitBtn.innerText = "Réessayer";
                submitBtn.disabled = false;
                return;
            }

            const data = await response.json();

            if (response.ok) { // Check for 200-299 status
                if (data.status === 'ACCEPTED') {
                    feedback.innerHTML = `<p style="color:green; font-weight:bold;">🎉 ${data.message}</p><p>Code: ${data.code}</p>`;
                    step1.style.display = 'none';

                    const addToCartBtn = document.createElement('button');
                    addToCartBtn.innerText = "Acheter maintenant (-" + price + "€)";
                    addToCartBtn.style.cssText = "background:green; color:white; padding:10px; border:none; margin-top:10px; cursor:pointer;";
                    addToCartBtn.onclick = function () {
                        fetch(window.Shopify.routes.root + 'cart/add.js', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                items: [{
                                    id: window.smartOfferConfig.variantId,
                                    quantity: 1
                                }]
                            })
                        })
                            .then(() => {
                                window.location.href = `/checkout?discount=${data.code}`;
                            });
                    };
                    feedback.appendChild(addToCartBtn);

                } else if (data.status === 'REJECTED' || data.status === 'COUNTER') {
                    feedback.innerHTML = `<p style="color:orange;">${data.message}</p><p>Contre-offre : <b>${data.counterPrice} €</b></p>`;
                } else {
                    feedback.innerHTML = `<p style="color:red;">Erreur: ${data.error || 'Réponse inconnue'}</p>`;
                }
            } else {
                // 4xx or 5xx handled intentionally by JSON return
                feedback.innerHTML = `<p style="color:red;">Erreur: ${data.error || 'Erreur serveur'}</p>`;
            }

        } catch (e) {
            console.error(e);
            feedback.innerHTML = `<p style='color:red;'>Erreur de communication: ${e.message}</p>`;
        } finally {
            submitBtn.disabled = false;
            if (submitBtn.innerText === "Le bot réfléchit...") {
                submitBtn.innerText = "Envoyer";
            }
        }
    }
});
