zrequire('hash_util');
zrequire('stream_data');
zrequire('people');

var hamlet = {
    user_id: 1,
    email: 'hamlet@example.com',
    full_name: 'Hamlet',
};

people.add_in_realm(hamlet);

var sub = {
    stream_id: 99,
    name: 'frontend',
};

stream_data.add_sub(sub.name, sub);

(function test_hash_util() {
    // Test encodeHashComponent
    var str = 'https://www.zulipexample.com';
    var result1 = hash_util.encodeHashComponent(str);
    assert.equal(result1, 'https.3A.2F.2Fwww.2Ezulipexample.2Ecom');

    // Test decodeHashComponent
    var result2 = hash_util.decodeHashComponent(result1);
    assert.equal(result2, str);

    // Test encode_operand and decode_operand

    function encode_decode_operand(operator, operand, expected_val) {
        var encode_result = hash_util.encode_operand(operator, operand);
        assert.equal(encode_result, expected_val);
        var new_operand = encode_result;
        var decode_result = hash_util.decode_operand(operator, new_operand);
        assert.equal(decode_result, operand);
    }

    var operator = 'sender';
    var operand = hamlet.email;

    encode_decode_operand(operator, operand, '1-hamlet');

    operator = 'stream';
    operand = 'frontend';

    encode_decode_operand(operator, operand, '99-frontend');

    operator = 'topic';
    operand = 'testing 123';

    encode_decode_operand(operator, operand, 'testing.20123');
}());
