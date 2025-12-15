import nodemailer from 'nodemailer';

export const EmailService = {
    async sendEmail(credentials, { to, subject, html }) {


        const { user, pass, smtpHost, smtpPort = 587 } = credentials;

        if (!user || !pass) {
            console.error("EmailService: Missing Credentials");
            return { success: false, error: "Missing Gmail Credentials in Settings" };
        }



        let transportConfig = {};

        if (smtpHost) {
            // Generic SMTP
            transportConfig = {
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465, // true for 465, false for other ports
                auth: {
                    user: user,
                    pass: pass,
                },
            };
        } else {
            // Default Gmail Service
            transportConfig = {
                service: 'gmail',
                auth: {
                    user: user,
                    pass: pass,
                },
            };
        }

        const transporter = nodemailer.createTransport(transportConfig);

        try {
            const info = await transporter.sendMail({
                from: `"${credentials.name || 'Smart Offer Bot'}" <${user}>`,
                to: to,
                subject: subject,
                html: html,
            });

            console.log("EmailService: Sent successfully", info.messageId);
            return { success: true, id: info.messageId };
        } catch (error) {
            console.error("EmailService: Exception", error);
            return { success: false, error: error.message };
        }
    },

    async sendOfferAccepted(credentials, to, code, endsAt, productTitle, checkoutUrl, customization = {}) {
        const {
            font = "Arial, sans-serif",
            primaryColor = "#008060",
            subject = "Your offer has been accepted! 🎉",
            body = `<h2>Congratulations! Your offer has been accepted.</h2><p>You successfully negotiated for the product: <strong>{productTitle}</strong>.</p><p>Here is your unique discount code:</p><h1 style="color: {color};">{code}</h1><p><strong>Attention:</strong> This code is valid only until: {endsAt}.</p>`
        } = customization;

        // Replace placeholders
        let htmlContent = body
            .replace(/{productTitle}/g, productTitle)
            .replace(/{code}/g, code)
            .replace(/{endsAt}/g, new Date(endsAt).toLocaleString())
            .replace(/{color}/g, primaryColor);

        // Add Checkout Button if URL exists
        if (checkoutUrl) {
            htmlContent += `
            <div style="margin: 30px 0;">
                <a href="${checkoutUrl}" style="background-color: ${primaryColor}; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    Buy now (discount applied)
                </a>
            </div>`;
        } else {
            htmlContent += `<p>Or use it manually at checkout.</p>`;
        }

        const html = `
        <div style="font-family: ${font}; color: #333;">
            ${htmlContent}
        </div>
        `;

        return this.sendEmail(credentials, { to, subject, html });
    },

    async sendOfferRejected(credentials, to, productTitle, productUrl, customization = {}) {
        const {
            font = "Arial, sans-serif",
            subject = "Update on your offer",
            body = `<h2>Regarding your offer for {productTitle}</h2><p>We have reviewed your proposal, but unfortunately we cannot accept it at this time.</p><p>Feel free to <a href='{productUrl}'>visit our shop</a> to make a different offer.</p>`
        } = customization;

        let htmlContent = body
            .replace(/{productTitle}/g, productTitle)
            .replace(/{productUrl}/g, productUrl);

        const html = `
        <div style="font-family: ${font}; color: #333;">
            ${htmlContent}
        </div>
        `;

        return this.sendEmail(credentials, { to, subject, html });
    },

    async sendCounterOffer(credentials, to, newPrice, productTitle, code, endsAt, checkoutUrl, productUrl, customization = {}) {
        const {
            font = "Arial, sans-serif",
            primaryColor = "#008060",
            subject = "Counter-offer for your request",
            body = `<h2>New proposal for {productTitle}</h2><p>Your initial offer was a bit low, but we want to find a deal.</p><p>We can offer you this product for the exceptional price of:</p><h1 style='color: blue;'>{newPrice} €</h1><p><strong>Accept this offer:</strong> Use code <strong style='color: green;'>{code}</strong> at checkout.</p><p>(Valid until {endsAt})</p>`
        } = customization;

        let htmlContent = body
            .replace(/{productTitle}/g, productTitle)
            .replace(/{newPrice}/g, newPrice)
            .replace(/{code}/g, code)
            .replace(/{endsAt}/g, new Date(endsAt).toLocaleString());

        if (checkoutUrl) {
            htmlContent += `
            <div style="margin: 20px 0;">
                <a href="${checkoutUrl}" style="background-color: ${primaryColor}; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    Buy now (${newPrice} €)
                </a>
            </div>`;
        }

        htmlContent += `
            <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
            <p><strong>Not interested?</strong></p>
            <p>If this price doesn't work for you, you can <a href="${productUrl}">return to the product page</a> to make a different offer.</p>
        `;

        const html = `
        <div style="font-family: ${font}; color: #333;">
            ${htmlContent}
        </div>
        `;

        return this.sendEmail(credentials, { to, subject, html });
    }
};
