import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    TextField,
    FormLayout,
    Box,
    Button,
    InlineStack,
    Toast,
    Frame,
    Link,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useTranslation } from "react-i18next";
import { EmailService } from "../services/EmailService";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });

    if (!shop) {
        return {
            gmailUser: "",
            hasPassword: false,
            smtpHost: "",
            smtpPort: 587,
        };
    }

    return {
        gmailUser: shop.gmailUser,
        hasPassword: !!shop.gmailAppPassword,
        smtpHost: shop.smtpHost,
        smtpPort: shop.smtpPort || 587,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType");

    if (actionType === "saveParameters") {
        const gmailUser = formData.get("gmailUser");
        const gmailAppPassword = formData.get("gmailAppPassword");
        const smtpHost = formData.get("smtpHost");
        const smtpPort = formData.get("smtpPort");

        const updateData = {
            gmailUser,
            smtpHost,
            smtpPort: smtpPort ? parseInt(smtpPort) : 587,
        };

        if (gmailAppPassword && gmailAppPassword !== "********") {
            updateData.gmailAppPassword = gmailAppPassword;
        }

        await db.shop.update({
            where: { shopUrl: session.shop },
            data: updateData,
        });

        return { success: true, message: "Settings saved successfully." };
    }

    if (actionType === "testConnection") {
        const gmailUser = formData.get("gmailUser");
        let gmailAppPassword = formData.get("gmailAppPassword");
        const smtpHost = formData.get("smtpHost");
        const smtpPort = formData.get("smtpPort");

        // If the password is still masked, we need to fetch the real one from DB
        // to test the connection using the existing saved credentials
        if (gmailAppPassword === "********") {
            const shop = await db.shop.findUnique({ where: { shopUrl: session.shop } });
            gmailAppPassword = shop?.gmailAppPassword || "";
        }

        const credentials = {
            user: gmailUser,
            pass: gmailAppPassword,
            smtpHost: smtpHost,
            smtpPort: smtpPort ? parseInt(smtpPort) : 587
        };

        const result = await EmailService.sendEmail(credentials, {
            to: gmailUser, // Send a test email to themselves
            subject: "Smart Offer Configuration Successful! ✅",
            html: `<p>Hello,</p><p>If you are reading this, it means your email configuration for <strong>Smart Offer</strong> is working perfectly!</p><p>Your customers will now be able to receive their discount codes and invoices from this address.</p>`
        });

        if (result.success) {
            return { success: true, message: "Connection successful! A test email has been sent." };
        } else {
            return { success: false, error: "Connection failed: " + (result.error || "Check your credentials.") };
        }
    }

    return { success: false };
};

export default function ParametersPage() {
    const loaderData = useLoaderData();
    const fetcher = useFetcher();
    const { t } = useTranslation();

    const [gmailUser, setGmailUser] = useState(loaderData.gmailUser || "");
    const [gmailAppPassword, setGmailAppPassword] = useState(loaderData.hasPassword ? "********" : "");
    const [smtpHost, setSmtpHost] = useState(loaderData.smtpHost || "");
    const [smtpPort, setSmtpPort] = useState(loaderData.smtpPort || 587);

    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const isModified =
            String(gmailUser) !== String(loaderData.gmailUser || "") ||
            (gmailAppPassword !== "********" && gmailAppPassword !== "") ||
            String(smtpHost) !== String(loaderData.smtpHost || "") ||
            String(smtpPort) !== String(loaderData.smtpPort || 587);

        setIsDirty(isModified);
    }, [gmailUser, gmailAppPassword, smtpHost, smtpPort, loaderData]);


    const [toastActive, setToastActive] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [toastError, setToastError] = useState(false);

    useEffect(() => {
        if (fetcher.data && fetcher.state === "idle") {
            if (fetcher.data.message || fetcher.data.error) {
                setToastMessage(fetcher.data.message || fetcher.data.error);
                setToastError(!fetcher.data.success);
                setToastActive(true);
            }
        }
    }, [fetcher.data, fetcher.state]);

    const toggleToast = () => setToastActive((active) => !active);

    const toastMarkup = toastActive ? (
        <Toast content={toastMessage} onDismiss={toggleToast} error={toastError} />
    ) : null;

    const handleSave = () => {
        let formData = new FormData();
        formData.append("actionType", "saveParameters");
        formData.append("gmailUser", gmailUser);
        formData.append("smtpHost", smtpHost);
        formData.append("smtpPort", smtpPort);
        if (gmailAppPassword !== "********") {
            formData.append("gmailAppPassword", gmailAppPassword);
        }

        fetcher.submit(formData, { method: "POST" });
    };

    const handleTestConnection = () => {
        let formData = new FormData();
        formData.append("actionType", "testConnection");
        formData.append("gmailUser", gmailUser);
        formData.append("smtpHost", smtpHost);
        formData.append("smtpPort", smtpPort);
        if (gmailAppPassword !== "********") {
            formData.append("gmailAppPassword", gmailAppPassword);
        } else {
            formData.append("gmailAppPassword", "********");
        }

        fetcher.submit(formData, { method: "POST" });
    };

    return (
        <Frame>
            {toastMarkup}
            <Page
                title={t('nav.parameters')}
                primaryAction={{
                    content: fetcher.state !== "idle" && fetcher.formData?.get("actionType") === "saveParameters" ? t('common.saving') : t('common.save'),
                    onAction: handleSave,
                    disabled: !isDirty || fetcher.state !== "idle",
                }}
            >
                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">{t('parameters.email_settings')}</Text>
                                <Box>
                                    <FormLayout>
                                        <TextField
                                            label={t('parameters.gmail_user')}
                                            value={gmailUser}
                                            onChange={setGmailUser}
                                            autoComplete="email"
                                            helpText={t('parameters.gmail_user_help')}
                                        />
                                        <TextField
                                            label={t('parameters.gmail_password')}
                                            value={gmailAppPassword}
                                            onChange={setGmailAppPassword}
                                            type="password"
                                            autoComplete="new-password"
                                            helpText={
                                                <span>
                                                    {t('parameters.gmail_password_help')} For Gmail, you must use an <Link url="https://myaccount.google.com/apppasswords" external>App Password</Link> (16 characters, no spaces).
                                                </span>
                                            }
                                        />
                                        <FormLayout.Group>
                                            <TextField
                                                label={t('parameters.smtp_host')}
                                                value={smtpHost}
                                                onChange={setSmtpHost}
                                                placeholder="smtp.office365.com"
                                                helpText={t('parameters.smtp_host_help')}
                                                autoComplete="off"
                                            />
                                            <TextField
                                                label={t('parameters.smtp_port')}
                                                value={smtpPort}
                                                onChange={setSmtpPort}
                                                type="number"
                                                autoComplete="off"
                                            />
                                        </FormLayout.Group>

                                        <div style={{ marginTop: '10px' }}>
                                            <InlineStack>
                                                <Button
                                                    onClick={handleTestConnection}
                                                    loading={fetcher.state !== "idle" && fetcher.formData?.get("actionType") === "testConnection"}
                                                    disabled={!gmailUser || (!gmailAppPassword && !loaderData.hasPassword)}
                                                >
                                                    Test Connection
                                                </Button>
                                            </InlineStack>
                                            <Text variant="bodySm" tone="subdued" as="p" style={{ marginTop: '8px' }}>
                                                Click to send a test email to your own address and verify that the configuration works.
                                            </Text>
                                        </div>
                                    </FormLayout>
                                </Box>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        </Frame>
    );
}
