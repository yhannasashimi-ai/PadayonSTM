FROM eclipse-temurin:17-jdk-jammy
WORKDIR /app
COPY . .
RUN javac Server.java
EXPOSE 8080
CMD ["java", "Server"]
