/** @odoo-module QWeb **/
/* global window, setTimeout, document, clearTimeout */
import {_t} from "@web/core/l10n/translation";
import {Component, onMounted, onWillStart, onWillUnmount, useRef} from "@odoo/owl";
import {AlertDialog} from "@web/core/confirmation_dialog/confirmation_dialog";
import {renderToString} from "@web/core/utils/render";
import {useService} from "@web/core/utils/hooks";

export default class SignOcaPdfCommon extends Component {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
        this.field_template = "sign_oca.sign_iframe_field";
        this.pdf_url = this.getPdfUrl();
        this.viewer_url = "/web/static/lib/pdfjs/web/viewer.html?file=" + this.pdf_url;
        this.iframe = useRef("sign_oca_iframe");
        var iframeResolve = "";
        var iframeReject = "";
        this.iframeLoaded = new Promise(function (resolve, reject) {
            iframeResolve = resolve;
            iframeReject = reject;
        });
        this.items = {};
        onWillUnmount(() => {
            clearTimeout(this.reviewFieldsTimeout);
        });
        this.iframeLoaded.resolve = iframeResolve;
        this.iframeLoaded.reject = iframeReject;
        onWillStart(this.willStart.bind(this));
        onMounted(() => {
            this.waitIframeLoaded();
        });
        this.dialogService = useService("dialog");
    }
    getPdfUrl() {
        return "/web/content/" + this.model + "/" + this.res_id + "/data";
    }
    async willStart() {
        const info = await this.orm.call(this.model, "get_info", [[this.res_id]]);
        this.info = info && typeof info === "object" ? info : {};
        this.info.items =
            this.info.items && typeof this.info.items === "object"
                ? this.info.items
                : {};
    }
    waitIframeLoaded() {
        const iframeEl = this.iframe.el;
        const iframeDocument = iframeEl && iframeEl.contentDocument;
        if (!iframeDocument) {
            var self = this;
            setTimeout(function () {
                self.waitIframeLoaded();
            }, 50);
            return;
        }
        var error = iframeDocument.getElementById("errorWrapper");
        if (error && window.getComputedStyle(error).display !== "none") {
            this.iframeLoaded.resolve();
            return this.dialogService.add(AlertDialog, {
                body: _t("Need a valid PDF to add signature fields !"),
            });
        }
        var nbPages =
            iframeDocument.getElementsByClassName("page").length;
        var nbLayers =
            iframeDocument.getElementsByClassName("endOfContent").length;
        if (nbPages > 0 && nbLayers > 0) {
            this.postIframeFields();
            this.reviewFields();
        } else {
            var self = this;
            setTimeout(function () {
                self.waitIframeLoaded();
            }, 50);
        }
    }
    reviewFields() {
        const iframeEl = this.iframe.el;
        const iframeDocument = iframeEl && iframeEl.contentDocument;
        if (!iframeDocument) {
            return;
        }
        if (
            iframeDocument.getElementsByClassName("o_sign_oca_ready").length === 0
        ) {
            this.postIframeFields();
        }
        this.reviewFieldsTimeout = setTimeout(this.reviewFields.bind(this), 1000);
    }
    postIframeFields() {
        const iframeEl = this.iframe.el;
        const iframeDocument = iframeEl && iframeEl.contentDocument;
        if (!iframeDocument) {
            return;
        }
        iframeDocument
            .getElementById("viewerContainer")
            .addEventListener(
                "drop",
                (e) => {
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                },
                true
            );
        var iframeCss = document.createElement("link");
        iframeCss.setAttribute("rel", "stylesheet");
        iframeCss.setAttribute("href", "/sign_oca/get_assets.css");
        iframeDocument
            .getElementsByTagName("head")[0]
            .append(iframeCss);
        $.each(this.info.items, (key) => {
            this.postIframeField(this.info.items[key]);
        });
        $(iframeDocument.getElementsByClassName("page")[0]).append($("<div class='o_sign_oca_ready'/>") );

        $(iframeDocument.getElementById("viewer")).addClass("sign_oca_ready");
        this.iframeLoaded.resolve();
    }
    postIframeField(item) {
        if (this.items[item.id]) {
            this.items[item.id].remove();
        }
        const iframeEl = this.iframe.el;
        const iframeDocument = iframeEl && iframeEl.contentDocument;
        if (!iframeDocument) {
            return;
        }
        var page =
            iframeDocument.getElementsByClassName("page")[item.page - 1];
        var signatureItem = $(
            renderToString(this.field_template, {
                ...item,
            })
        );
        page.append(signatureItem[0]);
        this.items[item.id] = signatureItem[0];
        return signatureItem;
    }
    // CheckSignItemsCompletion and navigate functions for handling navigation
    checkSignItemsCompletion() {
        const signItemsToComplete = [];
        $.each(this.info.items, (key, value) => {
            if (this.postIframeField(value) && this.postIframeField(value)[0]) {
                const $element = $(value);
                const signItemToComplete = {};
                signItemToComplete.data = $element[0];
                signItemToComplete.el = this.postIframeField(value)[0];
                signItemsToComplete.push(signItemToComplete);
            }
        });
        return signItemsToComplete;
    }
}
SignOcaPdfCommon.template = "sign_oca.SignOcaPdfCommon";
SignOcaPdfCommon.props = [];
