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
        };
    }

    return {
        gmailUser: shop.gmailUser,
        hasPassword: !!shop.gmailAppPassword,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType");

    if (actionType === "saveParameters") {
        const gmailUser = formData.get("gmailUser");
        const gmailAppPassword = formData.get("gmailAppPassword");

        const updateData = {
            gmailUser,
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

    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const isModified =
            gmailUser !== (loaderData.gmailUser || "") ||
            (gmailAppPassword !== "********" && gmailAppPassword !== "");

        setIsDirty(isModified);
    }, [gmailUser, gmailAppPassword, loaderData]);


    const handleSave = () => {
        let formData = new FormData();
        formData.append("actionType", "saveParameters");
        formData.append("gmailUser", gmailUser);
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
                                </FormLayout>
                            </Box>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
