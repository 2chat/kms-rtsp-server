// Copyright 2016 Etix Labs
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const net = require('net');
const rtspStream = require('rtsp-stream');
const Server = require('./server')(net, rtspStream);
const kurento = require('kurento-client');

const KMS_URL = process.env.KMS_WS_URL;
const PORT = process.env.PORT || 554;
const SRC_STREAM = process.env.SRC_STREAM;

// Establish connection with KMS
kurento(KMS_URL)
  .catch(error => {
    console.error(
      `Could not find media server at address ${KMS_URL}. Exiting:`,
      error
    );
    process.exit(1);
  })
  .then(kurentoClient => {
    const server = Server({ port: PORT });

    server.onConnection(client => {
      let pipeline, player;

      client.onSetup(handleSetup);
      client.onPlay(handlePlay);
      client.onTeardown(handleTeardown);
      client.onError(handleError);
      client.onClose(handleClose);

      async function handleSetup(sdpOffer) {
        console.log('Setting up pipeline');

        pipeline = await kurentoClient.create('MediaPipeline');
        pipeline.on('Error', kmsError);

        player = await pipeline.create('PlayerEndpoint', {
          uri: SRC_STREAM,
        });
        player.on('Error', kmsError);

        const rtpEndpoint = await pipeline.create('RtpEndpoint');
        rtpEndpoint.on('Error', kmsError);

        await rtpEndpoint.processOffer(sdpOffer);
        await player.connect(rtpEndpoint, 'VIDEO');

        const serverSdp = await rtpEndpoint.getLocalSessionDescriptor();

        return serverSdp;
      }

      async function handlePlay(url) {
        console.log('PLAY', url);
        if (player) {
          await player.play();
        }
      }

      async function handleTeardown(url) {
        console.log('TEARDOWN', url);
        if (pipeline) {
          await pipeline.release();
          pipeline = null;
        }
      }

      function handleError(error) {
        console.error('Server error:', error);
      }

      function handleClose() {
        console.info('Connection closed');
        if (pipeline) {
          console.log('Releasing pipeline...');
          pipeline.release();
        }
      }
    });
  });

function kmsError(error) {
  console.error('KMS Error', error);
}
