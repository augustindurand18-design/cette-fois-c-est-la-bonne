import nodemailer from 'nodemailer';

export const EmailService = {
    async sendEmail(credentials, { to, subject, html }) {
        const { user, pass } = credentials;

        if (!user || !pass) {
            console.error("EmailService: Missing Credentials");
            return { success: false, error: "Missing Gmail Credentials in Settings" };
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: user,
                pass: pass,
            },
        });

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

    async sendOfferAccepted(credentials, to, code, endsAt, productTitle, checkoutUrl) {
        const html = `
            <h2>Congratulations! Your offer has been accepted.</h2>
            <p>You successfully negotiated for the product: <strong>${productTitle}</strong>.</p>
            <p>Here is your unique discount code:</p>
            <h1 style="color: green;">${code}</h1>
            <p><strong>Attention:</strong> This code is valid only until: ${new Date(endsAt).toLocaleString()}.</p>
            
            ${checkoutUrl ? `
            <div style="margin: 30px 0;">
                <a href="${checkoutUrl}" style="background-color: #008060; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    Buy now (discount applied)
                </a>
            </div>
            ` : ''}

            <p>Or use it manually at checkout.</p>
        `;
        return this.sendEmail(credentials, { to, subject: "Your offer has been accepted! 🎉", html });
    },

    async sendOfferRejected(credentials, to, productTitle, productUrl) {
        const html = `
            <h2>Regarding your offer for ${productTitle}</h2>
            <p>We have reviewed your proposal, but unfortunately we cannot accept it at this time.</p>
            <p>Feel free to <a href="${productUrl}">visit our shop</a> to make a different offer.</p>
        `;
        return this.sendEmail(credentials, { to, subject: "Update on your offer", html });
    },

    async sendCounterOffer(credentials, to, newPrice, productTitle, code, endsAt, checkoutUrl, productUrl) {
        const html = `
            <h2>New proposal for ${productTitle}</h2>
            <p>Your initial offer was a bit low, but we want to find a deal.</p>
            <p>We can offer you this product for the exceptional price of:</p>
            <h1 style="color: blue;">${newPrice} €</h1>
            
            <p><strong>Accept this offer:</strong> Use code <strong style="color: green;">${code}</strong> at checkout.</p>
            <p>(Valid until ${new Date(endsAt).toLocaleString()})</p>

            ${checkoutUrl ? `
            <div style="margin: 20px 0;">
                <a href="${checkoutUrl}" style="background-color: #008060; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    Buy now (${newPrice} €)
                </a>
            </div>
            ` : ''}

            <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
            
            <p><strong>Not interested?</strong></p>
            <p>If this price doesn't work for you, you can <a href="${productUrl}">return to the product page</a> to make a different offer.</p>
        `;
        return this.sendEmail(credentials, { to, subject: "Counter-offer for your request", html });
    }
};
