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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useTranslation } from "react-i18next";

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

        return { success: true };
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
            gmailUser !== (loaderData.gmailUser || "") ||
            (gmailAppPassword !== "********" && gmailAppPassword !== "") ||
            smtpHost !== (loaderData.smtpHost || "") ||
            smtpPort !== (loaderData.smtpPort || 587);

        setIsDirty(isModified);
    }, [gmailUser, gmailAppPassword, smtpHost, smtpPort, loaderData]);


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

    return (
        <Page
            title={t('nav.parameters')}
            primaryAction={{
                content: fetcher.state !== "idle" ? t('common.saving') : t('common.save'),
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
                                        helpText={t('parameters.gmail_password_help')}
                                    />
                                    <FormLayout.Group>
                                        <TextField
                                            label="SMTP Host (Optional)"
                                            value={smtpHost}
                                            onChange={setSmtpHost}
                                            placeholder="smtp.office365.com"
                                            helpText="Leave empty to use default Gmail service."
                                            autoComplete="off"
                                        />
                                        <TextField
                                            label="SMTP Port"
                                            value={smtpPort}
                                            onChange={setSmtpPort}
                                            type="number"
                                            autoComplete="off"
                                        />
                                    </FormLayout.Group>
                                </FormLayout>
                            </Box>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
