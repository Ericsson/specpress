# Technical Specification - Version 3

## 1 Scope

This document defines the technical requirements for the communication protocol between network elements in 5G standalone networks.

## 2 References

The following documents contain provisions which, through reference in this text, constitute provisions of the present document.

- [1] 3GPP TS 38.300: "NR; Overall description; Stage 2"
- [2] 3GPP TS 38.413: "NG-RAN; NG Application Protocol (NGAP)"
- [3] 3GPP TS 38.331: "NR; Radio Resource Control (RRC) protocol specification"
- [4] 3GPP TS 33.501: "Security architecture and procedures for 5G System"

## 3 Definitions and Abbreviations

### 3.1 Definitions

For the purposes of the present document, the following terms and definitions apply:

**Base Station**: A network element that provides radio coverage.

**User Equipment**: A mobile device that connects to the network.

**Cell**: The geographical area covered by a base station.

**Bearer**: A transmission path with defined QoS characteristics.

### 3.2 Abbreviations

For the purposes of the present document, the following abbreviations apply:

- AMF Access and Mobility Management Function
- gNB Next Generation Node B
- UE User Equipment
- QoS Quality of Service
- RRC Radio Resource Control
- SDAP Service Data Adaptation Protocol

## 4 General Architecture

### 4.1 Overview

The system architecture consists of three main components:

- Core Network (CN) including AMF, SMF, and UPF
- Radio Access Network (RAN)
- User Equipment (UE)

The communication between these components is based on **standardized interfaces** defined by 3GPP.

### 4.2 Protocol Stack

The protocol stack includes the following layers:

- Physical Layer (PHY)
- Medium Access Control (MAC)
- Radio Link Control (RLC)
- Packet Data Convergence Protocol (PDCP)
- Service Data Adaptation Protocol (SDAP)

**NOTE 2**: SDAP is *only* used in 5G networks.

**NOTE 3**: The PDCP layer handles ciphering, integrity protection, and header compression.

## 5 Mathematical Models

### 5.1 Signal-to-Noise Ratio

The signal-to-noise ratio is calculated as:

$$ SNR = 10 \log_{10} \left( \frac{P_{signal}}{P_{noise}} \right) $$

where $P_{signal}$ is the signal power and $P_{noise}$ is the noise power in the same bandwidth.

### 5.2 Path Loss

The path loss in dB is calculated using the following formula:

$$ PL = 128.1 + 37.6 \log_{10}(d) $$

where $d$ is the distance in kilometers.

**NOTE 4**: This formula applies to urban macro scenarios at 2 GHz.

## 6 Interface Parameters

### 6.1 Timing Parameters

Table 6.1-1: Timing parameters

| Parameter | Value | Unit | Description                                         |
| --------- | ----- | ---- | --------------------------------------------------- |
| T300      | 1000  | ms   | RRC connection setup timeout                        |
| T301      | 2000  | ms   | RRC connection re-establishment timeout             |
| T310      | 3000  | ms   | Radio link failure timer                            |
| T311      | 10000 | ms   | RRC connection re-establishment procedure timer     |
| T319      | 5000  | ms   | RRC suspend timer                                   |
| T320      | 60000 | ms   | Periodic TAU timer                                  |

### 6.2 Power Parameters

The transmit power ranges are: minimum power -40 dBm, maximum power 23 dBm (for power class 3), power control step 1 dB, and power control range 63 dB.

**NOTE 5**: Different power classes may have different maximum power values.

## 7 Procedures

### 7.1 Connection Establishment

The connection establishment procedure consists of the following steps:

- UE sends RRC Connection Request with establishment cause
- gNB validates the request and allocates resources
- gNB responds with RRC Connection Setup
- UE sends RRC Connection Setup Complete with capability information
- Connection is established

**NOTE 1**: The UE shall include its capabilities in the RRC Connection Setup Complete message.

### 7.2 Handover Procedure

The handover procedure is initiated when the signal quality falls below a threshold or load balancing is required.

**EXAMPLE**: If the RSRP is below -110 dBm for more than 5 seconds, the UE triggers a measurement report.

The handover can be either intra-frequency or inter-frequency depending on the target cell.

Steps:

- Source gNB sends Handover Request to target gNB
- Target gNB prepares resources and responds
- Source gNB sends RRC Reconfiguration to UE
- UE performs handover and confirms to target gNB

### 7.3 Connection Release

The connection release procedure is initiated by the network when the UE is idle for an extended period.

- gNB sends RRC Connection Release
- UE acknowledges and returns to idle mode
- Context is cleared on both sides

## 8 Security

### 8.1 Authentication

The authentication procedure uses a challenge-response mechanism based on shared keys and 5G-AKA protocol.

The authentication vector includes:

- RAND (random challenge)
- AUTN (authentication token)
- XRES (expected response)
- KAUSF (key for AUSF)

### 8.2 Encryption

All user plane data shall be encrypted using the specified algorithms:

- NEA0 (null encryption - for testing only)
- NEA1 (SNOW 3G)
- NEA2 (AES)
- NEA3 (ZUC)

### 8.3 Integrity Protection

Control plane messages are protected using integrity algorithms:

- NIA1 (SNOW 3G)
- NIA2 (AES)
- NIA3 (ZUC)

**NOTE 6**: User plane integrity protection is optional and configured per bearer.

## 9 Protocol Messages

### 9.1 Message Structure

The message structure follows ASN.1 encoding:

```asn
-- RRC Connection Request Message
RRCConnectionRequest ::= SEQUENCE {
    rrc-TransactionIdentifier   RRC-TransactionIdentifier,
    criticalExtensions          CHOICE {
        rrcConnectionRequest-r8     RRCConnectionRequest-r8-IEs,
        criticalExtensionsFuture    SEQUENCE {}
    }
}

RRCConnectionRequest-r8-IEs ::= SEQUENCE {
    ue-Identity                 InitialUE-Identity,
    establishmentCause          EstablishmentCause,
    spare                       BIT STRING (SIZE (1))
}

-- Connection Setup Message
RRCConnectionSetup ::= SEQUENCE {
    rrc-TransactionIdentifier   RRC-TransactionIdentifier,
    criticalExtensions          CHOICE {
        c1                          CHOICE {
            rrcConnectionSetup-r8       RRCConnectionSetup-r8-IEs
        },
        criticalExtensionsFuture    SEQUENCE {}
    }
}

-- New in v3: Reconfiguration Message
RRCReconfiguration ::= SEQUENCE {
    rrc-TransactionIdentifier   RRC-TransactionIdentifier,
    criticalExtensions          CHOICE {
        rrcReconfiguration          RRCReconfiguration-IEs,
        criticalExtensionsFuture    SEQUENCE {}
    }
}
```

### 9.2 Procedure Flow

The following diagram shows the ***enhanced*** connection establishment flow:

```mermaid
sequenceDiagram
    participant UE
    participant gNB
    participant AMF
    participant UPF
    
    UE->>gNB: RRC Connection Request
    gNB->>UE: RRC Connection Setup
    UE->>gNB: RRC Connection Setup Complete
    gNB->>AMF: Initial UE Message
    AMF->>gNB: Initial Context Setup Request
    gNB->>UE: Security Mode Command
    UE->>gNB: Security Mode Complete
    Note over UE,gNB: Connection established
    AMF->>UPF: Session Establishment
    UPF-->>AMF: Session Established
```

Figure 9.2-1: Connection establishment procedure

**NOTE 3**: The security mode command includes both *encryption* and **integrity** algorithm selection.

### 9.3 Configuration Parameters

The configuration includes *multi-level* parameters:

- 1> **Radio Parameters**:

  - 2> Frequency: Operating frequency band (FR1 or FR2)

  - 2> Bandwidth: Channel bandwidth configuration

    - 3> Minimum: 5 MHz

    - 3> Maximum: 100 MHz (FR1) or 400 MHz (FR2)

  - 2> Power: Transmit power settings with **dynamic adjustment**

- 1> **Timer Values**:

  - 2> Short timers: Used for immediate responses

  - 2> Long timers: Used for periodic updates

  - 2> Emergency timers: For critical situations

- 1> **QoS Settings**:

  - 2> Priority levels from 1 to 15

  - 2> Delay budgets configured per flow

  - 2> Packet error rate thresholds

  - 2> Jitter requirements for real-time services

### 9.4 Capability Information

The following table uses *embedded* JsonTable format:

```jsonTable
{
  "columns": [
    {"key": "feature", "name": "Feature", "align": "left"},
    {"key": "supported", "name": "Supported", "align": "center"},
    {"key": "version", "name": "Version", "align": "center"},
    {"key": "mandatory", "name": "Mandatory", "align": "center"}
  ],
  "rows": [
    {"feature": "Dual Connectivity", "supported": "Yes", "version": "Rel-15", "mandatory": "No"},
    {"feature": "Carrier Aggregation", "supported": "Yes", "version": "Rel-15", "mandatory": "No"},
    {"feature": "Beamforming", "supported": "**Yes**", "version": "Rel-15", "mandatory": "Yes"},
    {"feature": "5G NR", "supported": "Yes", "version": "Rel-15", "mandatory": "Yes"}
  ]
}
```

Table 9.4-1: UE capability support matrix

**NOTE 2**: The UE shall report all supported features during capability exchange.
