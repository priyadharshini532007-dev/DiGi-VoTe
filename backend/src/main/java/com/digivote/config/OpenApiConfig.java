package com.digivote.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI digiVoteOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("DIGI-VOTE API")
                        .version("1.0.0")
                        .description("DIGI-VOTE secure election management platform. Authenticate with "
                                + "POST /api/auth/login and send the token as 'Authorization: Bearer <token>'. "
                                + "Ballot submission (/api/public/elections/{id}/ballots) is deliberately "
                                + "unauthenticated: it is authorized by an anonymous blind-signed credential."))
                .components(new Components().addSecuritySchemes("bearer",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer"));
    }
}
