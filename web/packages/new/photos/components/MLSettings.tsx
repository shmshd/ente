import {
    canEnableML,
    disableML,
    enableML,
    getIsMLEnabledRemote,
    isMLEnabled,
    pauseML,
} from "@/new/photos/services/ml";
import { EnteDrawer } from "@/new/shared/components/EnteDrawer";
import { MenuItemGroup } from "@/new/shared/components/Menu";
import { Titlebar } from "@/new/shared/components/Titlebar";
import { pt, ut } from "@/next/i18n";
import log from "@/next/log";
import EnteSpinner from "@ente/shared/components/EnteSpinner";
import { EnteMenuItem } from "@ente/shared/components/Menu/EnteMenuItem";
import {
    Box,
    Button,
    Checkbox,
    type DialogProps,
    FormControlLabel,
    FormGroup,
    Link,
    Stack,
    Typography,
} from "@mui/material";
import { t } from "i18next";
import React, { useEffect, useState } from "react";
import { Trans } from "react-i18next";
import type { NewAppContextPhotos } from "../types/context";
import { openURL } from "../utils/web";

interface MLSettingsProps {
    /** If `true`, then this drawer page is shown. */
    open: boolean;
    /** Called when the user wants to go back from this drawer page. */
    onClose: () => void;
    /** Called when the user wants to close the entire stack of drawers. */
    onRootClose: () => void;
    /** See: [Note: Migrating components that need the app context]. */
    appContext: NewAppContextPhotos;
}

export const MLSettings: React.FC<MLSettingsProps> = ({
    open,
    onClose,
    onRootClose,
    appContext,
}) => {
    const {
        setDialogMessage,
        somethingWentWrong,
        startLoading,
        finishLoading,
    } = appContext;

    /**
     * The state of our component.
     *
     * To avoid confusion with useState, we call it status instead. */
    // TODO: This Status is not automatically synced with the lower layers that
    // hold the actual state.
    type Status =
        | "loading" /* fetching the data we need from the lower layers */
        | "notEligible" /* user is not in the beta program */
        | "disabled" /* eligible, but ML is currently disabled */
        | "enabledOrPaused"; /* ML is enabled, but may be paused (See isPaused) */

    const [status, setStatus] = useState<Status>("loading");
    const [openFaceConsent, setOpenFaceConsent] = useState(false);
    /** Only valid when status is "enabledOrPaused" */
    const [isPaused, setIsPaused] = useState(false);

    const refreshStatus = async () => {
        if (isMLEnabled()) {
            setStatus("enabledOrPaused");
            setIsPaused(false);
        } else if (await getIsMLEnabledRemote()) {
            setStatus("enabledOrPaused");
            setIsPaused(true);
        } else if (await canEnableML()) {
            setStatus("disabled");
        } else {
            setStatus("notEligible");
        }
    };

    useEffect(() => {
        void refreshStatus();
    }, []);

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    const handleDrawerClose: DialogProps["onClose"] = (_, reason) => {
        if (reason == "backdropClick") handleRootClose();
        else onClose();
    };

    // The user may've changed the remote flag on a different device, so in both
    // cases (enable or resume), do the same flow:
    //
    // -   If remote flag is not set, then show the consent dialog
    // -   Otherwise enable ML (both locally and on remote).
    //
    const handleEnableOrResumeML = async () => {
        startLoading();
        try {
            if (!(await getIsMLEnabledRemote())) {
                setOpenFaceConsent(true);
            } else {
                await enableML();
                setStatus("enabledOrPaused");
                setIsPaused(false);
            }
        } catch (e) {
            log.error("Failed to enable or resume ML", e);
            somethingWentWrong();
        } finally {
            finishLoading();
        }
    };

    const handleConsent = async () => {
        startLoading();
        try {
            await enableML();
            setStatus("enabledOrPaused");
            setIsPaused(false);
            // Close the FaceConsent drawer, come back to ourselves.
            setOpenFaceConsent(false);
        } catch (e) {
            log.error("Failed to enable ML", e);
            somethingWentWrong();
        } finally {
            finishLoading();
        }
    };

    const handlePauseML = () => {
        try {
            pauseML();
            setStatus("enabledOrPaused");
            setIsPaused(true);
        } catch (e) {
            log.error("Failed to enable ML", e);
            somethingWentWrong();
        }
    };

    const handleDisableML = async () => {
        startLoading();
        try {
            await disableML();
            setStatus("disabled");
        } catch (e) {
            log.error("Failed to disable ML", e);
            somethingWentWrong();
        } finally {
            finishLoading();
        }
    };

    const components: Record<Status, React.ReactNode> = {
        loading: <Loading />,
        notEligible: <ComingSoon />,
        disabled: <EnableML onEnable={handleEnableOrResumeML} />,
        enabledOrPaused: (
            <ManageML
                isPaused={isPaused}
                onPauseML={handlePauseML}
                onResumeML={handleEnableOrResumeML}
                onDisableML={handleDisableML}
                setDialogMessage={setDialogMessage}
            />
        ),
    };

    return (
        <Box>
            <EnteDrawer
                anchor="left"
                transitionDuration={0}
                open={open}
                onClose={handleDrawerClose}
                BackdropProps={{
                    sx: { "&&&": { backgroundColor: "transparent" } },
                }}
            >
                <Stack spacing={"4px"} py={"12px"}>
                    <Titlebar
                        onClose={onClose}
                        title={pt("ML search")}
                        onRootClose={onRootClose}
                    />
                    {components[status]}
                </Stack>
            </EnteDrawer>

            <FaceConsent
                open={openFaceConsent}
                onClose={() => setOpenFaceConsent(false)}
                onRootClose={handleRootClose}
                onConsent={handleConsent}
            />
        </Box>
    );
};

const Loading: React.FC = () => {
    return (
        <Box textAlign="center" pt={4}>
            <EnteSpinner />
        </Box>
    );
};

const ComingSoon: React.FC = () => {
    return (
        <Box px="8px">
            <Typography color="text.muted">
                {ut("We're putting finishing touches, coming back soon!")}
            </Typography>
        </Box>
    );
};

interface EnableMLProps {
    /** Called when the user enables ML. */
    onEnable: () => void;
}

const EnableML: React.FC<EnableMLProps> = ({ onEnable }) => {
    // TODO-ML: Update link.
    const moreDetails = () => openURL("https://ente.io/blog/desktop-ml-beta");

    return (
        <Stack py={"20px"} px={"16px"} spacing={"32px"}>
            <Typography color="text.muted">
                {pt(
                    "Enable ML (Machine Learning) for face recognition, magic search and other advanced search features",
                )}
            </Typography>
            <Stack spacing={"8px"}>
                <Button color={"accent"} size="large" onClick={onEnable}>
                    {t("ENABLE")}
                </Button>

                <Button color="secondary" size="large" onClick={moreDetails}>
                    {t("ML_MORE_DETAILS")}
                </Button>
            </Stack>
            <Typography color="text.faint" variant="small">
                {pt(
                    'Magic search allows to search photos by their contents (e.g. "car", "red car" or even "ferrari")',
                )}
            </Typography>
        </Stack>
    );
};

type FaceConsentProps = Omit<MLSettingsProps, "appContext"> & {
    /** Called when the user provides their consent. */
    onConsent: () => void;
};

const FaceConsent: React.FC<FaceConsentProps> = ({
    open,
    onClose,
    onRootClose,
    onConsent,
}) => {
    const [acceptTerms, setAcceptTerms] = useState(false);

    useEffect(() => {
        setAcceptTerms(false);
    }, [open]);

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    const handleDrawerClose: DialogProps["onClose"] = (_, reason) => {
        if (reason == "backdropClick") handleRootClose();
        else onClose();
    };

    return (
        <EnteDrawer
            transitionDuration={0}
            open={open}
            onClose={handleDrawerClose}
            BackdropProps={{
                sx: { "&&&": { backgroundColor: "transparent" } },
            }}
        >
            <Stack spacing={"4px"} py={"12px"}>
                <Titlebar
                    onClose={onClose}
                    title={t("ENABLE_FACE_SEARCH_TITLE")}
                    onRootClose={handleRootClose}
                />
                <Stack py={"20px"} px={"8px"} spacing={"32px"}>
                    <Typography color="text.muted" px={"8px"}>
                        <Trans
                            i18nKey={"ENABLE_FACE_SEARCH_DESCRIPTION"}
                            components={{
                                a: (
                                    <Link
                                        target="_blank"
                                        href="https://ente.io/privacy#8-biometric-information-privacy-policy"
                                        underline="always"
                                        sx={{
                                            color: "inherit",
                                            textDecorationColor: "inherit",
                                        }}
                                    />
                                ),
                            }}
                        />
                    </Typography>
                    <FormGroup sx={{ width: "100%" }}>
                        <FormControlLabel
                            sx={{
                                color: "text.muted",
                                ml: 0,
                                mt: 2,
                            }}
                            control={
                                <Checkbox
                                    size="small"
                                    checked={acceptTerms}
                                    onChange={(e) =>
                                        setAcceptTerms(e.target.checked)
                                    }
                                />
                            }
                            label={t("FACE_SEARCH_CONFIRMATION")}
                        />
                    </FormGroup>
                    <Stack px={"8px"} spacing={"8px"}>
                        <Button
                            color={"accent"}
                            size="large"
                            disabled={!acceptTerms}
                            onClick={onConsent}
                        >
                            {t("ENABLE_FACE_SEARCH")}
                        </Button>
                        <Button
                            color={"secondary"}
                            size="large"
                            onClick={onClose}
                        >
                            {t("CANCEL")}
                        </Button>
                    </Stack>
                </Stack>
            </Stack>
        </EnteDrawer>
    );
};

interface ManageMLProps {
    /** `true` if ML is locally paused. */
    isPaused: boolean;
    /** Called when the user wants to pause ML. */
    onPauseML: () => void;
    /** Called when the user wants to resume ML. */
    onResumeML: () => void;
    /** Called when the user wants to disable ML. */
    onDisableML: () => void;
    /** Subset of appContext. */
    setDialogMessage: NewAppContextPhotos["setDialogMessage"];
}

const ManageML: React.FC<ManageMLProps> = ({
    isPaused,
    onPauseML,
    onResumeML,
    onDisableML,
    setDialogMessage,
}) => {
    const confirmDisableML = () => {
        setDialogMessage({
            title: t("DISABLE_FACE_SEARCH_TITLE"),
            content: (
                <Typography>
                    <Trans i18nKey={"DISABLE_FACE_SEARCH_DESCRIPTION"} />
                </Typography>
            ),
            close: { text: t("CANCEL") },
            proceed: {
                variant: "primary",
                text: t("DISABLE_FACE_SEARCH"),
                action: onDisableML,
            },
        });
    };

    // TODO-ML:
    // const [indexingStatus, setIndexingStatus] = useState<CLIPIndexingStatus>({
    //     indexed: 0,
    //     pending: 0,
    // });

    // useEffect(() => {
    //     clipService.setOnUpdateHandler(setIndexingStatus);
    //     clipService.getIndexingStatus().then((st) => setIndexingStatus(st));
    //     return () => clipService.setOnUpdateHandler(undefined);
    // }, []);
    /* TODO-ML: isElectron() && (
        <Box>
            <MenuSectionTitle
                title={t("MAGIC_SEARCH_STATUS")}
            />
            <Stack py={"12px"} px={"12px"} spacing={"24px"}>
                <VerticallyCenteredFlex
                    justifyContent="space-between"
                    alignItems={"center"}
                >
                    <Typography>
                        {t("INDEXED_ITEMS")}
                    </Typography>
                    <Typography>
                        {formatNumber(
                            indexingStatus.indexed,
                        )}
                    </Typography>
                </VerticallyCenteredFlex>
                <VerticallyCenteredFlex
                    justifyContent="space-between"
                    alignItems={"center"}
                >
                    <Typography>
                        {t("PENDING_ITEMS")}
                    </Typography>
                    <Typography>
                        {formatNumber(
                            indexingStatus.pending,
                        )}
                    </Typography>
                </VerticallyCenteredFlex>
            </Stack>
        </Box>
    )*/

    return (
        <Box px={"16px"}>
            <Stack py={"20px"} spacing={"24px"}>
                <MenuItemGroup>
                    {isPaused ? (
                        <EnteMenuItem
                            onClick={onResumeML}
                            label={pt("Resume on this device")}
                        />
                    ) : (
                        <EnteMenuItem
                            onClick={onPauseML}
                            label={t("DISABLE_BETA")}
                        />
                    )}
                </MenuItemGroup>
                <MenuItemGroup>
                    <EnteMenuItem
                        onClick={confirmDisableML}
                        label={t("DISABLE_FACE_SEARCH")}
                    />
                </MenuItemGroup>
            </Stack>
        </Box>
    );
};
