from odoo import http
from odoo.exceptions import AccessError, MissingError
from odoo.http import request
import logging

from odoo.addons.base.models.assetsbundle import AssetsBundle
from odoo.addons.portal.controllers.portal import CustomerPortal

_logger = logging.getLogger(__name__)


class SignController(http.Controller):
    @http.route("/sign_oca/get_assets.<any(css,js):ext>", type="http", auth="public")
    def get_sign_resources(self, ext):
        # The iframe only needs CSS overlays; serve a no-op JS payload to avoid
        # hashed bundle redirects when no JS files are part of sign_assets.
        if ext == "js":
            return request.make_response("", headers=[("Content-Type", "application/javascript")])
        bundle = "sign_oca.sign_assets"
        files, _ = request.env["ir.qweb"]._get_asset_content(bundle)
        asset = AssetsBundle(bundle, files)
        try:
            mock_attachment = getattr(asset, ext)()
            if isinstance(mock_attachment, list):
                mock_attachment = mock_attachment[0]
            # Try streaming the attachment (normal path)
            stream = request.env["ir.binary"]._get_stream_from(mock_attachment)
            response = stream.get_response()
            return response
        except Exception as exc:
            # Fallback: build response from raw asset content to avoid filestore issues
            _logger.exception("Asset streaming failed, falling back to direct content: %s", exc)
            try:
                parts = []
                # files can be dict or list of tuples
                if isinstance(files, dict):
                    iterable = files.items()
                else:
                    iterable = files
                for entry in iterable:
                    # normalize (path, content)
                    if isinstance(entry, tuple) and len(entry) == 2:
                        path, content = entry
                    else:
                        # if just a string, include it
                        path = None
                        content = entry
                    if not content:
                        continue
                    # if path present, filter by extension
                    if path:
                        if not path.endswith('.' + ext):
                            continue
                    parts.append(content.decode() if isinstance(content, bytes) else content)
                combined = '\n'.join(parts)
                mimetype = 'text/css' if ext == 'css' else 'application/javascript'
                headers = [('Content-Type', mimetype)]
                return request.make_response(combined, headers=headers)
            except Exception:
                _logger.exception("Fallback assembling asset content failed")
                # Last resort: return empty response with appropriate type
                mimetype = 'text/css' if ext == 'css' else 'application/javascript'
                return request.make_response('', headers=[('Content-Type', mimetype)])


class PortalSign(CustomerPortal):
    @http.route(
        ["/sign_oca/document/<int:signer_id>/<string:access_token>"],
        type="http",
        auth="public",
        website=True,
    )
    def get_sign_oca_access(self, signer_id, access_token, **kwargs):
        try:
            signer_sudo = self._document_check_access(
                "sign.oca.request.signer", signer_id, access_token
            )
        except (AccessError, MissingError):
            return request.redirect("/my")
        if signer_sudo.signed_on:
            return request.render(
                "sign_oca.portal_sign_document_signed",
                {
                    "signer": signer_sudo,
                    "company": signer_sudo.request_id.company_id,
                },
            )
        return request.render(
            "sign_oca.portal_sign_document",
            {
                "doc": signer_sudo.request_id,
                "partner": signer_sudo.partner_id,
                "signer": signer_sudo,
                "access_token": access_token,
                "sign_oca_backend_info": {
                    "access_token": access_token,
                    "signer_id": signer_sudo.id,
                    "lang": signer_sudo.partner_id.lang,
                },
            },
        )

    @http.route(
        ["/sign_oca/content/<int:signer_id>/<string:access_token>"],
        type="http",
        auth="public",
        website=True,
    )
    def get_sign_oca_content_access(self, signer_id, access_token):
        try:
            signer_sudo = self._document_check_access(
                "sign.oca.request.signer", signer_id, access_token
            )
        except (AccessError, MissingError):
            return request.redirect("/my")
        return http.Stream.from_binary_field(
            signer_sudo.request_id, "data"
        ).get_response(mimetype="application/pdf")

    @http.route(
        ["/sign_oca/info/<int:signer_id>/<string:access_token>"],
        type="json",
        auth="public",
        website=True,
    )
    def get_sign_oca_info_access(self, signer_id, access_token):
        try:
            signer_sudo = self._document_check_access(
                "sign.oca.request.signer", signer_id, access_token
            )
        except (AccessError, MissingError):
            return request.redirect("/my")
        return signer_sudo.get_info(access_token=access_token)

    @http.route(
        ["/sign_oca/sign/<int:signer_id>/<string:access_token>"],
        type="json",
        auth="public",
        website=True,
    )
    def get_sign_oca_sign_access(
        self, signer_id, access_token, items, latitude=False, longitude=False
    ):
        try:
            signer_sudo = self._document_check_access(
                "sign.oca.request.signer", signer_id, access_token
            )
        except (AccessError, MissingError):
            return request.redirect("/my")
        return signer_sudo.action_sign(
            items, access_token=access_token, latitude=latitude, longitude=longitude
        )

    @http.route(
        ["/sign_oca/refuse/<int:signer_id>/<string:access_token>"],
        type="json",
        auth="public",
        website=True,
    )
    def get_sign_oca_refuse_access(self, signer_id, access_token):
        try:
            signer_sudo = self._document_check_access(
                "sign.oca.request.signer", signer_id, access_token
            )
        except (AccessError, MissingError):
            return request.redirect("/odoo")
        return signer_sudo.refuse(access_token=access_token)
