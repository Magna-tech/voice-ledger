import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing details live outside the repo. Point VOICE_LEDGER_SIGNING at a
// keystore.properties file, or put one at ~/.voice-ledger-signing/keystore.properties.
// Without it, release builds come out unsigned; debug builds always work.
val signing = Properties().apply {
    val path = System.getenv("VOICE_LEDGER_SIGNING")
        ?: "${System.getProperty("user.home")}/.voice-ledger-signing/keystore.properties"
    val f = file(path)
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.magnatech.voiceledger"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.magnatech.voiceledger"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (!signing.isEmpty) {
            create("release") {
                storeFile = file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // The web app in ../site is the UI. It is packaged as-is, so the website and the app stay in step.
    sourceSets["main"].assets.srcDir(rootProject.file("../site"))
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
