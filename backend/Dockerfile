# DIGI-VOTE backend image. Build from the REPOSITORY ROOT so web/ (the HTML prototype) is packaged into the jar:
#   docker build -f backend/Dockerfile -t digivote-backend .
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src/backend
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
COPY web /src/web
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 digivote
WORKDIR /app
COPY --from=build /src/backend/target/digivote-backend-1.0.0.jar app.jar
USER digivote
ENV DIGIVOTE_DEV_MODE=false
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
