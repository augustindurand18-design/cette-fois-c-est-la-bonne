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
                from: `"Smart Offer Bot" <${user}>`,
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

    async sendOfferAccepted(credentials, to, code, endsAt, productTitle) {
        const html = `
            <h2>Félicitations ! Votre offre a été acceptée.</h2>
            <p>Vous avez négocié avec succès pour le produit : <strong>${productTitle}</strong>.</p>
            <p>Voici votre code promotionnel unique :</p>
            <h1 style="color: green;">${code}</h1>
            <p><strong>Attention :</strong> Ce code est valable uniquement jusqu'au : ${new Date(endsAt).toLocaleString()}.</p>
            <p>Utilisez-le dès maintenant lors du paiement.</p>
        `;
        return this.sendEmail(credentials, { to, subject: "Votre offre a été acceptée ! 🎉", html });
    },

    async sendOfferRejected(credentials, to, productTitle) {
        const html = `
            <h2>Concernant votre offre pour ${productTitle}</h2>
            <p>Nous avons bien étudié votre proposition, mais nous ne pouvons malheureusement pas l'accepter pour le moment.</p>
            <p>N'hésitez pas à visiter notre boutique pour d'autres articles.</p>
        `;
        return this.sendEmail(credentials, { to, subject: "Mise à jour sur votre offre", html });
    },

    async sendCounterOffer(credentials, to, newPrice, productTitle) {
        const html = `
            <h2>Nouvelle proposition pour ${productTitle}</h2>
            <p>Votre offre initiale était un peu basse, mais nous voulons trouver un terrain d'entente.</p>
            <p>Nous pouvons vous proposer ce produit au prix exceptionnel de :</p>
            <h1 style="color: blue;">${newPrice} €</h1>
            <p>Si cela vous convient, répondez à cet email pour finaliser l'achat.</p>
        `;
        return this.sendEmail(credentials, { to, subject: "Contre-proposition pour votre offre", html });
    }
};
