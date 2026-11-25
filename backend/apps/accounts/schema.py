from drf_spectacular.extensions import OpenApiAuthenticationExtension


class AccessTokenScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.AccessTokenAuthentication"
    name = "accessToken"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
