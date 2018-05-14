# -*- coding: utf-8 -*-
from django.http import HttpResponse
from zerver.lib.test_classes import ZulipTestCase
from zerver.lib.actions import do_change_stream_web_public
from zerver.lib.actions import get_web_public_streams, get_web_public_subs, \
    do_deactivate_stream
from zerver.models import get_realm

class GlobalPublicStreamTest(ZulipTestCase):

    def test_non_existant_stream_id(self) -> None:
        # Here we use a relatively big number as stream id assumming such an id
        # won't exist in the test DB.
        result = self.client_get("/archive/streams/100000000/topic/TopicGlobal")
        self.assert_in_success_response(["This stream does not exist."], result)

    def test_non_web_public_stream(self) -> None:
        test_stream = self.make_stream('Test Public Archives')
        result = self.client_get(
            "/archive/streams/" + str(test_stream.id) + "/topic/notpublicglobalstream"
        )
        self.assert_in_success_response(["This stream does not exist."], result)

    def test_non_existant_topic(self) -> None:
        test_stream = self.make_stream('Test Public Archives')
        do_change_stream_web_public(test_stream, True)
        result = self.client_get(
            "/archive/streams/" + str(test_stream.id) + "/topic/nonexistenttopic"
        )
        self.assert_in_success_response(["This topic does not exist."], result)

    def test_web_public_stream_topic(self) -> None:
        test_stream = self.make_stream('Test Public Archives')
        do_change_stream_web_public(test_stream, True)

        def send_msg_and_get_result(msg: str) -> HttpResponse:
            self.send_stream_message(
                self.example_email("iago"),
                "Test Public Archives",
                msg,
                'TopicGlobal'
            )
            return self.client_get(
                "/archive/streams/" + str(test_stream.id) + "/topic/TopicGlobal"
            )

        result = send_msg_and_get_result('Test Message 1')
        self.assert_in_success_response(["Test Message 1"], result)
        result = send_msg_and_get_result('/me goes testing.')
        self.assert_in_success_response(["goes testing."], result)

    def test_get_web_public_streams(self) -> None:
        realm = get_realm("zulip")
        public_streams = get_web_public_streams(realm)
        self.assert_length(public_streams, 1)
        public_stream = public_streams[0]
        self.assertEqual(public_stream['name'], "Rome")

        public_subs, public_unsubs, public_neversubs = get_web_public_subs(realm)
        self.assert_length(public_subs, 1)
        public_sub = public_subs[0]
        self.assertEqual(public_sub['name'], "Rome")
        self.assert_length(public_unsubs, 0)
        self.assert_length(public_neversubs, 0)

        # Now add a second public stream
        test_stream = self.make_stream('Test Public Archives')
        do_change_stream_web_public(test_stream, True)
        public_streams = get_web_public_streams(realm)
        self.assert_length(public_streams, 2)
        public_subs, public_unsubs, public_neversubs = get_web_public_subs(realm)
        self.assert_length(public_subs, 2)
        self.assert_length(public_unsubs, 0)
        self.assert_length(public_neversubs, 0)
        self.assertNotEqual(public_subs[0]['color'], public_subs[1]['color'])

        do_deactivate_stream(test_stream)
        public_streams = get_web_public_streams(realm)
        self.assert_length(public_streams, 1)
        public_subs, public_unsubs, public_neversubs = get_web_public_subs(realm)
        self.assert_length(public_subs, 1)
        self.assert_length(public_unsubs, 0)
        self.assert_length(public_neversubs, 0)
