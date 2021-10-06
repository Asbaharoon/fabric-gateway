/*
 * Copyright 2020 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as grpc from '@grpc/grpc-js';
import { Message } from 'google-protobuf';
import { ChaincodeEventsResponse, CommitStatusResponse, EndorseRequest, EndorseResponse, EvaluateRequest, EvaluateResponse, SignedChaincodeEventsRequest, SignedCommitStatusRequest, SubmitRequest, SubmitResponse, EndpointError } from './protos/gateway/gateway_pb';
import { Status } from './protos/google/rpc/status_pb';
import * as gateway from './gateway'

const servicePath = '/gateway.Gateway/';
const evaluateMethod = servicePath + 'Evaluate';
const endorseMethod = servicePath + 'Endorse';
const submitMethod = servicePath + 'Submit';
const commitStatusMethod = servicePath + 'CommitStatus';
const chaincodeEventsMethod = servicePath + 'ChaincodeEvents';

export interface GatewayClient {
    evaluate(request: EvaluateRequest): Promise<EvaluateResponse>;
    endorse(request: EndorseRequest): Promise<EndorseResponse>;
    submit(request: SubmitRequest): Promise<SubmitResponse>;
    commitStatus(request: SignedCommitStatusRequest): Promise<CommitStatusResponse>;
    chaincodeEvents(request: SignedChaincodeEventsRequest): AsyncIterable<ChaincodeEventsResponse>;
}

class GatewayClientImpl implements GatewayClient {
    #client: grpc.Client;

    constructor(client: grpc.Client) {
        this.#client = client;
    }

    evaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
        return new Promise((resolve, reject) =>
            this.#client.makeUnaryRequest(evaluateMethod, serialize, deserializeEvaluateResponse, request, newUnaryCallback(resolve, reject))
        );
    }

    endorse(request: EndorseRequest): Promise<EndorseResponse> {
        return new Promise((resolve, reject) =>
            this.#client.makeUnaryRequest(endorseMethod, serialize, deserializeEndorseResponse, request, newUnaryCallback(resolve, reject))
        );
    }

    submit(request: SubmitRequest): Promise<SubmitResponse> {
        return new Promise((resolve, reject) =>
            this.#client.makeUnaryRequest(submitMethod, serialize, deserializeSubmitResponse, request, newUnaryCallback(resolve, reject))
        );
    }

    commitStatus(request: SignedCommitStatusRequest): Promise<CommitStatusResponse> {
        return new Promise((resolve, reject) =>
            this.#client.makeUnaryRequest(commitStatusMethod, serialize, deserializeCommitStatusResponse, request, newUnaryCallback(resolve, reject))
        );
    }

    chaincodeEvents(request: SignedChaincodeEventsRequest): AsyncIterable<ChaincodeEventsResponse> {
        return this.#client.makeServerStreamRequest(chaincodeEventsMethod, serialize, deserializeChaincodeEventsResponse, request);
    }
}

function newUnaryCallback<T>(resolve: (value: T) => void, reject: (reason: Error) => void): grpc.requestCallback<T> {
    return (err, value) => {
        if (err) {
            const details: gateway.EndpointError[] = [];
            if (typeof err.metadata !== 'undefined') {
                const gsdb = err.metadata.get('grpc-status-details-bin')
                gsdb.forEach(detail => {
                    const status = deserializeStatus(detail as Uint8Array)
                    status.getDetailsList().forEach(d => {
                        const ee = deserializeEndpointError(d.getValue_asU8())
                        details.push({
                            mspid: ee.getMspId(),
                            address: ee.getAddress(),
                            message: ee.getMessage()
                        });
                    })
                })
            }
            const gwErr: gateway.GatewayError = new Error(err.message);
            gwErr.code = err.code;
            gwErr.details = details;
            return reject(gwErr);
        }
        if (value == null) {
            return reject(new Error('No result returned'));
        }
        return resolve(value);
    }
}

function serialize(message: Message): Buffer {
    const bytes = message.serializeBinary();
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength); // Create a Buffer view to avoid copying
}

function deserializeEvaluateResponse(bytes: Uint8Array): EvaluateResponse {
    return EvaluateResponse.deserializeBinary(bytes);
}

function deserializeEndorseResponse(bytes: Uint8Array): EndorseResponse {
    return EndorseResponse.deserializeBinary(bytes);
}

function deserializeSubmitResponse(bytes: Uint8Array): SubmitResponse {
    return SubmitResponse.deserializeBinary(bytes);
}

function deserializeCommitStatusResponse(bytes: Uint8Array): CommitStatusResponse {
    return CommitStatusResponse.deserializeBinary(bytes);
}

function deserializeChaincodeEventsResponse(bytes: Uint8Array): ChaincodeEventsResponse {
    return ChaincodeEventsResponse.deserializeBinary(bytes);
}

function deserializeStatus(bytes: Uint8Array): Status {
    return Status.deserializeBinary(bytes);
}

function deserializeEndpointError(bytes: Uint8Array): EndpointError {
    return EndpointError.deserializeBinary(bytes);
}

export function newGatewayClient(client: grpc.Client): GatewayClient {
    return new GatewayClientImpl(client);
}
